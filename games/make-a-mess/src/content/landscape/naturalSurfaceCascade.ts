/**
 * The natural-surface cascade: the ONE source of the carpet law.
 *
 * Igor's two patterns, verbatim (17.08.2026): "ландшафтность в текстуре"
 * (every octave carries hill morphology — billowed noise, rounded tops and
 * pinched hollows) and "самоподобие — текстура в текстуре в текстуре" (the
 * SAME generator repeated from metres down past the pixel; stopping the
 * cascade at any resolvable scale is what reads as bald plastic — proven by
 * control tile P). Reference tiles live in
 * games/make-a-mess/docs/kallur/carpet-lab/, formulas in
 * scripts/kallur-carpet-lab.mjs; this module carries the ACCEPTED numbers so
 * the field sampler, the ground shader band and the vegetation scatter read
 * one law instead of re-deriving three.
 *
 * Octaves change CARRIER with distance, never technology: the tonal masses
 * and hummocks live in real geometry (landscapeSampler), everything from
 * ~0.4 m down lives here as shader albedo + derivative-bump normal, and the
 * near ring's discrete stems are the SAME cascade (lab tile W: spike hatch
 * clustered on octaves 3–4). They are not a second GrassField species.
 * Hand-over contracts (same seeds, energy conservation at fades, root color
 * slaving) are documented in docs/kallur/carpet-port-plan.md.
 */

export interface CascadeOctave {
  readonly wavelength: number;
  readonly amplitude: number;
  /** Contour stretch: coarse octaves lean along the terracette direction. */
  readonly stretch: number;
  /** Domain rotation — a shared lattice reads as woven squares. */
  readonly angle: number;
  readonly seed: number;
  /** Billow (|n|) keeps hill morphology; the finest octaves go plain. */
  readonly billow: boolean;
}

export interface NaturalSurfacePalette {
  readonly base: string;
  readonly alt: string;
  readonly lit: string;
  readonly seamDark: string;
  readonly moss: string;
  readonly straw: string;
  readonly thatch: string;
}

export interface NaturalSurfaceProfile {
  readonly id: "kallur-carpet" | "viking-heath";
  readonly octaves: readonly CascadeOctave[];
  readonly palette: NaturalSurfacePalette;
}

function createNaturalSurfaceOctaves(options: {
  readonly wavelength: number;
  readonly amplitude: number;
  readonly persistence: number;
  readonly stretch: number;
  readonly stretchPersistence: number;
  readonly seed: number;
  readonly billowCount: number;
  readonly angles: readonly number[];
}): readonly CascadeOctave[] {
  const octaves: CascadeOctave[] = [];
  let amplitude = options.amplitude;
  let wavelength = options.wavelength;
  let stretch = options.stretch;
  for (let index = 0; index < options.angles.length; index += 1) {
    octaves.push({
      wavelength,
      amplitude,
      stretch,
      angle: options.angles[index],
      seed: options.seed + index * 17,
      billow: index < options.billowCount,
    });
    amplitude *= options.persistence;
    wavelength *= 0.5;
    stretch = 1 + (stretch - 1) * options.stretchPersistence;
  }
  return octaves;
}

/** Lab tile Y/N/O cascade, ported verbatim: a0 0.12, persistence 0.62. */
export const KALLUR_CASCADE: readonly CascadeOctave[] = (() => {
  const angles = [0, 0.35, -0.3, 0.8, -0.75, 1.2, -1.1];
  const octaves: CascadeOctave[] = [];
  let amplitude = 0.12;
  let wavelength = 1.7;
  let stretch = 1.6;
  for (let index = 0; index < 7; index += 1) {
    octaves.push({
      wavelength,
      amplitude,
      stretch,
      angle: angles[index],
      seed: 401 + index * 17,
      billow: index < 5,
    });
    amplitude *= 0.62;
    wavelength *= 0.5;
    stretch = 1 + (stretch - 1) * 0.7;
  }
  return octaves;
})();

/**
 * Viking turf is its own material language: close-cropped northern heath,
 * flatter than Kallur, with less coherent billow and no standing-stem hatch.
 * It keeps the laboratory's octave hand-off without copying the Faroese fur.
 */
export const VIKING_HEATH_CASCADE: readonly CascadeOctave[] = createNaturalSurfaceOctaves({
  wavelength: 1.35,
  amplitude: 0.052,
  persistence: 0.56,
  stretch: 1.22,
  stretchPersistence: 0.62,
  seed: 701,
  billowCount: 3,
  angles: [0.18, -0.52, 0.71, -0.93, 1.26, -1.35, 0.43],
});

/** Lab tile Y masses, verbatim — the octave the field was missing. */
export const KALLUR_TONAL_MASSES = {
  wavelength: 6.5,
  amplitude: 0.55,
  seed: 601,
} as const;

/** Measured Kallur palette (kallur-brief.md), shared with the lab. */
export const KALLUR_CARPET_PALETTE: NaturalSurfacePalette = {
  base: "#6d7046",
  alt: "#757641",
  lit: "#b3b374",
  seamDark: "#3a4426",
  moss: "#8f8d52",
  straw: "#c7c084",
  thatch: "#71603a",
} as const;

export const VIKING_HEATH_PALETTE: NaturalSurfacePalette = {
  base: "#64734e",
  alt: "#7b825a",
  lit: "#b4aa76",
  seamDark: "#2d3927",
  moss: "#87945d",
  straw: "#b8ad77",
  thatch: "#867754",
} as const;

export const NATURAL_SURFACE_PROFILES: Readonly<
  Record<NaturalSurfaceProfile["id"], NaturalSurfaceProfile>
> = {
  "kallur-carpet": {
    id: "kallur-carpet",
    octaves: KALLUR_CASCADE,
    palette: KALLUR_CARPET_PALETTE,
  },
  "viking-heath": {
    id: "viking-heath",
    octaves: VIKING_HEATH_CASCADE,
    palette: VIKING_HEATH_PALETTE,
  },
};

/**
 * Walking-frame hatch (the look we are holding). Pattern size stays;
 * `fadeWavelength` is the previous cutoff plus ~5 m of the same pile.
 */
export const KALLUR_NEAR_STEM = {
  wavelengthA: 0.028,
  stretchA: 0.11,
  seedA: 511,
  wavelengthB: 0.11,
  stretchB: 0.03,
  seedB: 512,
  rotA: { c: 0.42, s: 0.91 },
  rotB: { c: 0.95, s: 0.31 },
  heightBase: 0.014,
  heightCrest: 0.032,
  fadeWavelength: 0.034,
  strawMix: 0.4,
  thatchMix: 0.4,
} as const;

/**
 * Viking near/medium carrier: the same pixel-footprint hand-off as Kallur's
 * ground-bound stems, but a different organism. The main cascade supplies a
 * connected sponge cushion; this layer supplies its dense low nap. It never
 * becomes separate droplets, upright blades or instanced tufts.
 */
export const VIKING_MOSS_MICRO = {
  napWavelengthA: 0.011,
  napWavelengthB: 0.024,
  warpWavelength: 0.13,
  warpAmplitude: 0.007,
  clusterWavelength: 0.18,
  seedA: 1181,
  seedB: 1187,
  warpSeedA: 1193,
  warpSeedB: 1201,
  clusterSeed: 1213,
  // The heath cascade already owns the moss cushion. This band carries only
  // its dense nap, so its energy is millimetres rather than separate domes.
  heightBase: 0.0018,
  heightCluster: 0.0015,
  // Same carrier cut-off as Kallur's accepted near-stem layer. Pattern size
  // stays fixed; only its energy dissolves as the pixel footprint grows.
  fadeWavelength: KALLUR_NEAR_STEM.fadeWavelength,
} as const;

/**
 * Close-cropped village grass: a dense surface-bound mesh impression, not
 * instanced bunches. Slow colonies choose a local lay direction; fine broken
 * strokes supply short blades and dissolve on Kallur's accepted carrier law.
 */
export const VIKING_GRASS_MICRO = {
  bladeWidth: 0.014,
  bladeLength: 0.086,
  breakAcross: 0.056,
  breakAlong: 0.03,
  warpWavelength: 0.21,
  warpAmplitude: 0.012,
  choiceWavelength: 0.72,
  angleA: 0.31,
  angleB: -0.91,
  clusterWavelength: 0.26,
  bladeSeed: 1229,
  breakSeed: 1231,
  warpSeedA: 1237,
  warpSeedB: 1249,
  choiceSeed: 1259,
  clusterSeed: 1277,
  heightBase: 0.0038,
  heightCrown: 0.0086,
  fadeWavelength: KALLUR_NEAR_STEM.fadeWavelength,
} as const;

/**
 * Close path mud: boot-churned humus, shallow retained water and sparse flat
 * leaf litter. Direction changes by colony, so it cannot become wheel ruts or
 * one repeated parallel brush over every route.
 */
export const VIKING_MUD_MICRO = {
  smearAcross: 0.036,
  smearAlong: 0.17,
  breakWavelength: 0.072,
  crumbWavelength: 0.028,
  warpWavelength: 0.39,
  warpAmplitude: 0.026,
  choiceWavelength: 0.94,
  angleA: 0.24,
  angleB: -1.03,
  smearSeed: 1283,
  breakSeed: 1289,
  crumbSeed: 1291,
  warpSeedA: 1297,
  warpSeedB: 1301,
  choiceSeed: 1303,
  heightSmear: 0.0065,
  heightCrumb: 0.0022,
  leafCell: 0.18,
  leafLength: 0.068,
  leafWidth: 0.027,
  leafPresence: 0.76,
  leafSeed: 1319,
  leafAngleSeed: 1321,
  leafOffsetSeedA: 1327,
  leafOffsetSeedB: 1361,
  leafToneSeed: 1367,
  fadeWavelength: 0.12,
  leafFadeWavelength: 0.085,
} as const;

/**
 * Leftover for the unused Kallur GrassField path. Near comfort is
 * `KALLUR_NEAR_STEM` in the ground band; do not revive instance lawns.
 */
export const KALLUR_STRAND_LAW = {
  geometryWavelength: KALLUR_NEAR_STEM.fadeWavelength,
  instanceCount: 0,
  oversample: 3,
  ridgeStart: 0.18,
  ridgeEnd: 0.55,
  nearFine: 0.55,
  farFine: 1.18,
} as const;

/** CPU twin of GLSL `nscFade` — an octave dissolves into its mean. */
export function kallurCascadeFade(wavelength: number, footprint: number): number {
  const start = wavelength * 0.25;
  const end = wavelength * 0.9;
  const t = Math.max(0, Math.min(1, (footprint - start) / Math.max(1e-8, end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/** 1 while a lock still owns octaves 3–4 as geometry; 0 when the band does. */
export function kallurStrandCarrier(footprint: number, personal = 1): number {
  return kallurCascadeFade(KALLUR_STRAND_LAW.geometryWavelength * personal, footprint);
}

/**
 * The slope law (accepted tile group Q–V): the landform is the senior
 * octave and COMMANDS the junior ones. Grade combs cushions into fall-line
 * streaks and takes their energy; where the comb has nothing to hold on to
 * it dissolves back into tufts.
 */
export const KALLUR_SLOPE_LAW = {
  streakinessStart: 0.12,
  streakinessEnd: 0.5,
  coarseDamp: 0.55,
  fineDamp: 0.35,
  streakAmplitude: 0.05,
  streakBrightness: 0.05,
  silvering: 0.1,
} as const;

function srgbChannelToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * The lab renders in display sRGB; the three.js fragment works in linear.
 * Palette constants are linearised HERE so a lab tile and a world frame of
 * the same formula land on the same pixels after the output transform.
 */
function glslColor(hex: string): string {
  const r = srgbChannelToLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbChannelToLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbChannelToLinear(parseInt(hex.slice(5, 7), 16) / 255);
  return `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
}

/** Linearised flat definition color the ground tint was premultiplied with. */
export function kallurFlatBaseGlsl(): string {
  return glslColor(KALLUR_CARPET_PALETTE.base);
}

/** Measured wall stone ("скала средняя", kallur-brief.md), linearised. */
export function kallurWallMidGlsl(): string {
  return glslColor("#6d7165");
}

const glslNumber = (value: number): string => value.toFixed(6);

/**
 * GLSL functions for the ground shader band. Numbers are interpolated from
 * the constants above — the sky's CLOUD_LAW pattern: anything written twice
 * will drift apart. The noise hash matches landscapeSampler.valueNoise
 * (127.1 / 311.7 / 74.7 / 43758.5453), so shader features sit on the same
 * spots of the island as every CPU consumer of the law.
 */
export function kallurCascadeGlsl(): string {
  const p = KALLUR_CARPET_PALETTE;
  const law = KALLUR_SLOPE_LAW;
  const stem = KALLUR_NEAR_STEM;
  const octaveLines = KALLUR_CASCADE.map((octave, index) => {
    const c = glslNumber(Math.cos(octave.angle));
    const s = glslNumber(Math.sin(octave.angle));
    const wx = glslNumber(octave.wavelength * octave.stretch);
    const wz = glslNumber(octave.wavelength);
    const seed = glslNumber(octave.seed);
    const amp = glslNumber(octave.amplitude);
    const damp = index < 3 ? "coarseCalm" : "fineCalm";
    const shape = octave.billow
      ? "abs(nscSample)"
      : "nscSample * 0.5 + 0.5";
    const fadeW = glslNumber(octave.wavelength);
    return `  nscSample = nscNoise(vec2(
    (point.x * ${c} - point.y * ${s}) / ${wx},
    (point.x * ${s} + point.y * ${c}) / ${wz}), ${seed});
  height += (${shape}) * ${amp} * ${damp} * nscFade(${fadeW}, footprint);`;
  }).join("\n");

  return /* glsl */ `
float nscHash(vec2 cell, float seed) {
  return fract(sin(cell.x * 127.1 + cell.y * 311.7 + seed * 74.7) * 43758.5453);
}
float nscNoise(vec2 point, float seed) {
  vec2 cell = floor(point);
  vec2 fraction = point - cell;
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  float a = nscHash(cell, seed);
  float b = nscHash(cell + vec2(1.0, 0.0), seed);
  float c = nscHash(cell + vec2(0.0, 1.0), seed);
  float d = nscHash(cell + vec2(1.0, 1.0), seed);
  return (mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y)) * 2.0 - 1.0;
}
// The lab's footprint law (tile X), GPU edition: an octave whose wavelength
// sinks below the pixel must dissolve into its MEAN, not fire one random
// texel per pixel — unfaded procedural noise reads as grey glitter and eats
// the palette's saturation.
float nscFade(float wavelength, float footprint) {
  return 1.0 - smoothstep(wavelength * 0.25, wavelength * 0.9, footprint);
}
float nscStreak(vec2 acrossAlong, float footprint) {
  return nscNoise(vec2(acrossAlong.x / 0.14, acrossAlong.y / 2.2), 361.0) * 0.45 * nscFade(0.14, footprint) +
    nscNoise(vec2(acrossAlong.x / 0.3, acrossAlong.y / 3.5), 362.0) * 0.35 * nscFade(0.3, footprint) +
    nscNoise(vec2(acrossAlong.x / 0.6, acrossAlong.y / 5.0), 364.0) * 0.3 * nscFade(0.6, footprint);
}
// Lab tile W: a burst of STEMS, not a dome. Two rotated stretched billows
// max-combined, clustered on cascade octaves 3–4 so the hatch cannot
// contradict the carpet it stands on.
float nscStemCluster(vec2 point) {
  float third = abs(nscNoise(vec2(
    (point.x * ${glslNumber(Math.cos(KALLUR_CASCADE[3].angle))} - point.y * ${glslNumber(Math.sin(KALLUR_CASCADE[3].angle))}) / ${glslNumber(KALLUR_CASCADE[3].wavelength * KALLUR_CASCADE[3].stretch)},
    (point.x * ${glslNumber(Math.sin(KALLUR_CASCADE[3].angle))} + point.y * ${glslNumber(Math.cos(KALLUR_CASCADE[3].angle))}) / ${glslNumber(KALLUR_CASCADE[3].wavelength)}), ${glslNumber(KALLUR_CASCADE[3].seed)}));
  float fourth = abs(nscNoise(vec2(
    (point.x * ${glslNumber(Math.cos(KALLUR_CASCADE[4].angle))} - point.y * ${glslNumber(Math.sin(KALLUR_CASCADE[4].angle))}) / ${glslNumber(KALLUR_CASCADE[4].wavelength * KALLUR_CASCADE[4].stretch)},
    (point.x * ${glslNumber(Math.sin(KALLUR_CASCADE[4].angle))} + point.y * ${glslNumber(Math.cos(KALLUR_CASCADE[4].angle))}) / ${glslNumber(KALLUR_CASCADE[4].wavelength)}), ${glslNumber(KALLUR_CASCADE[4].seed)}));
  return clamp((third * 0.8 + fourth * 0.6) * 1.2 - 0.1, 0.0, 1.0);
}
float nscSpike(vec2 point) {
  float a = abs(nscNoise(vec2(
    (point.x * ${glslNumber(stem.rotA.c)} - point.y * ${glslNumber(stem.rotA.s)}) / ${glslNumber(stem.wavelengthA)},
    (point.x * ${glslNumber(stem.rotA.s)} + point.y * ${glslNumber(stem.rotA.c)}) / ${glslNumber(stem.stretchA)}), ${glslNumber(stem.seedA)}));
  float b = abs(nscNoise(vec2(
    (point.x * ${glslNumber(stem.rotB.c)} + point.y * ${glslNumber(stem.rotB.s)}) / ${glslNumber(stem.wavelengthB)},
    (point.x * ${glslNumber(-stem.rotB.s)} + point.y * ${glslNumber(stem.rotB.c)}) / ${glslNumber(stem.stretchB)}), ${glslNumber(stem.seedB)}));
  float ridge = max(1.0 - a, 1.0 - b);
  return ridge * ridge;
}
// The carpet height: every octave the mesh cannot carry. comb in [0,1] is
// the slope law's grip — it flattens the coarse cushions (their energy goes
// to the streaks) and lays the fine fur down.
float nscCarpetHeight(vec2 point, vec2 acrossAlong, float comb, float detail, float footprint) {
  float height = 0.0;
  float nscSample = 0.0;
  float coarseCalm = 1.0 - comb * ${glslNumber(law.coarseDamp)};
  float fineCalm = (1.0 - comb * ${glslNumber(law.fineDamp)}) * detail;
${octaveLines}
  height += nscStreak(acrossAlong, footprint) * ${glslNumber(law.streakAmplitude)} * comb;
  height += nscSpike(point)
    * (${glslNumber(stem.heightBase)} + nscStemCluster(point) * ${glslNumber(stem.heightCrest)})
    * nscFade(${glslNumber(stem.fadeWavelength)}, footprint);
  return height;
}
// The carpet albedo, generated from the palette — it does not decorate a
// texture, it IS the texture (the canvas squares die on this band). litness
// is n·sun so the grain lives only in the light.
vec3 nscCarpetAlbedo(vec2 point, vec2 acrossAlong, float comb, float litness, float footprint) {
  // "patch" is a reserved GLSL word (tessellation) — hence nscPatch.
  float nscMacro = nscNoise(point / 1.7, 41.0) * nscFade(1.7, footprint);
  float nscPatch = nscNoise(point / 2.9, 87.0) * nscFade(2.9, footprint);
  vec3 carpet = mix(${glslColor(p.base)}, ${glslColor(p.alt)}, 0.5 + 0.5 * nscMacro);
  carpet = mix(carpet, ${glslColor(p.lit)}, smoothstep(0.18, 0.68, nscPatch) * 0.55);
  float octaveOne = abs(nscNoise(vec2(
    (point.x * ${glslNumber(Math.cos(KALLUR_CASCADE[1].angle))} - point.y * ${glslNumber(Math.sin(KALLUR_CASCADE[1].angle))}) / ${glslNumber(KALLUR_CASCADE[1].wavelength * KALLUR_CASCADE[1].stretch)},
    (point.x * ${glslNumber(Math.sin(KALLUR_CASCADE[1].angle))} + point.y * ${glslNumber(Math.cos(KALLUR_CASCADE[1].angle))}) / ${glslNumber(KALLUR_CASCADE[1].wavelength)}), ${glslNumber(KALLUR_CASCADE[1].seed)}));
  float octaveTwo = abs(nscNoise(vec2(
    (point.x * ${glslNumber(Math.cos(KALLUR_CASCADE[2].angle))} - point.y * ${glslNumber(Math.sin(KALLUR_CASCADE[2].angle))}) / ${glslNumber(KALLUR_CASCADE[2].wavelength * KALLUR_CASCADE[2].stretch)},
    (point.x * ${glslNumber(Math.sin(KALLUR_CASCADE[2].angle))} + point.y * ${glslNumber(Math.cos(KALLUR_CASCADE[2].angle))}) / ${glslNumber(KALLUR_CASCADE[2].wavelength)}), ${glslNumber(KALLUR_CASCADE[2].seed)}));
  // Billowed octaves fade toward their MEAN (|n| averages ~0.45), so the
  // far field keeps the palette instead of collapsing to the crest color.
  octaveOne = mix(0.45, octaveOne, nscFade(${glslNumber(KALLUR_CASCADE[1].wavelength)}, footprint));
  octaveTwo = mix(0.45, octaveTwo, nscFade(${glslNumber(KALLUR_CASCADE[2].wavelength)}, footprint));
  float moss = smoothstep(0.05, 0.75, nscNoise(point / 3.6, 321.0) * nscFade(3.6, footprint));
  carpet = mix(carpet, ${glslColor(p.moss)}, moss * 0.45);
  // PAINTED structure stays a whisper: strong crest/hollow terms drew the
  // octave-one skeleton as a single-wavelength vein maze over the whole
  // hill — a pattern nature never paints (Igor, 20.08). The cushions are
  // carried by LIGHT on the derivative bump; albedo only seasons.
  float crest = clamp(octaveOne * 0.75 + octaveTwo * 0.5, 0.0, 1.0);
  carpet = mix(carpet, ${glslColor(p.lit)}, smoothstep(0.5, 1.0, crest) * 0.14);
  float hollow = pow(1.0 - clamp(octaveOne * 1.7, 0.0, 1.0), 2.2);
  carpet = mix(carpet, ${glslColor(p.seamDark)}, hollow * 0.2);
  carpet = mix(carpet, ${glslColor(p.thatch)}, smoothstep(0.32, 0.06, octaveOne) * 0.1);
  float tuft = nscFade(${glslNumber(stem.fadeWavelength)}, footprint);
  carpet = mix(carpet, ${glslColor(p.thatch)}, smoothstep(0.32, 0.06, octaveOne) * ${glslNumber(stem.thatchMix)} * tuft);
  carpet = mix(carpet, ${glslColor(p.straw)}, nscSpike(point) * nscStemCluster(point) * ${glslNumber(stem.strawMix)} * tuft);
  float streak = nscStreak(acrossAlong, footprint);
  carpet *= 1.0 + streak * ${glslNumber(law.streakBrightness)} * comb;
  carpet = mix(carpet, ${glslColor(p.straw)}, comb * ${glslNumber(law.silvering)});
  float grain = nscNoise(point / 0.035, 233.0) * 0.09 * nscFade(0.035, footprint) +
    nscNoise(point / 0.06, 234.0) * 0.06 * nscFade(0.06, footprint);
  carpet *= 1.0 + grain * (0.35 + 0.85 * litness);
  return carpet;
}
// The BEACH profile (Igor, 21.08): Kalsoy has no golden sand — its coves
// hold dark volcanic shingle and near-black sand (Tjornuvik family). The
// same cascade draws both: sharp billow cells for the shingle, fine grain
// for the sand, contour bands parallel to the waterline, and the wet band
// darkening toward the water. Heights are WORLD y: sand below ~0.9,
// shingle to ~2.0, turf above.
vec3 nscBeachAlbedo(vec2 point, float worldY, float litness, float footprint) {
  float shingleCell = pow(abs(nscNoise(point / 0.16, 641.0)), 1.3)
    * nscFade(0.16, footprint);
  float shingleTone = nscNoise(point / 0.45, 642.0) * nscFade(0.45, footprint);
  vec3 shingle = mix(
    ${glslColor("#23211f")},
    ${glslColor("#6b6660")},
    clamp(shingleCell * 1.15 + shingleTone * 0.25 + 0.22, 0.0, 1.0));
  float sandGrain = nscNoise(point / 0.045, 651.0) * 0.6
    + nscNoise(point / 0.11, 652.0) * 0.4;
  vec3 sand = ${glslColor("#4a4643")}
    * (1.0 + sandGrain * 0.16 * nscFade(0.08, footprint));
  // Waterline-parallel bands: contours of height, the tide's own ruling.
  sand *= 1.0 + sin(worldY * 9.0 + nscNoise(point / 1.4, 654.0) * 2.0) * 0.05;
  float sandiness = smoothstep(1.15, 0.75, worldY);
  vec3 beach = mix(shingle, sand, sandiness);
  float wet = smoothstep(1.3, 0.7, worldY);
  beach = mix(beach, beach * 0.42, wet);
  beach *= 1.0 + nscNoise(point / 0.03, 653.0) * 0.06
    * (0.35 + 0.85 * litness) * nscFade(0.03, footprint);
  return beach;
}
`;
}

/**
 * Viking member of the same reusable octave family. It deliberately exposes
 * material signals instead of one final colour: a world may combine the same
 * heath structure with its own traffic, wetness and soil laws. Polder can use
 * the carrier without inheriting Viking mud or Kallur's Faroese palette.
 */
export function vikingHeathCascadeGlsl(): string {
  const p = VIKING_HEATH_PALETTE;
  const moss = VIKING_MOSS_MICRO;
  const grass = VIKING_GRASS_MICRO;
  const mud = VIKING_MUD_MICRO;
  const octaveLines = VIKING_HEATH_CASCADE.map((octave, index) => {
    const c = glslNumber(Math.cos(octave.angle));
    const s = glslNumber(Math.sin(octave.angle));
    const wx = glslNumber(octave.wavelength * octave.stretch);
    const wz = glslNumber(octave.wavelength);
    const seed = glslNumber(octave.seed);
    const fade = `nscFade(${glslNumber(octave.wavelength)}, footprint)`;
    const sample = `nscNoise(vec2(
      (point.x * ${c} - point.y * ${s}) / ${wx},
      (point.x * ${s} + point.y * ${c}) / ${wz}), ${seed})`;
    const shaped = octave.billow ? `abs(${sample})` : `(${sample} * 0.5 + 0.5)`;
    return `  float nsvOctave${index} = mix(0.45, ${shaped}, ${fade});`;
  }).join("\n");
  const heightLines = VIKING_HEATH_CASCADE.map((octave, index) =>
    `  height += (nsvOctave${index} - 0.45) * ${glslNumber(octave.amplitude)};`
  ).join("\n");

  return /* glsl */ `
void nsvHeathCascade(
  vec2 point,
  float footprint,
  out float height,
  out float cushions,
  out float fibre,
  out float litter
) {
${octaveLines}
  height = 0.0;
${heightLines}
  cushions = clamp(nsvOctave0 * 0.44 + nsvOctave1 * 0.34 + nsvOctave2 * 0.28, 0.0, 1.0);
  // Matted old growth is made from isolated extrema in a warped isotropic
  // field. It produces torn curls and felted patches, never the continuous
  // zero-contours that drew the rejected engraved "threads".
  vec2 fibreWarp = vec2(
    nscNoise(point / 0.74, 941.0),
    nscNoise(point / 0.91, 947.0)
  ) * 0.12;
  float fibreGuide = 1.0 - abs(nscNoise((point + fibreWarp) / 0.21, 953.0));
  float fibreBreak = abs(nscNoise((point - fibreWarp * 0.55) / 0.115, 957.0));
  float fibreCrumple = pow(clamp(fibreGuide, 0.0, 1.0), 2.35)
    * smoothstep(0.28, 0.78, fibreBreak);
  vec2 crumbWarp = vec2(
    nscNoise(point / 0.43, 963.0),
    nscNoise(point / 0.37, 967.0)
  ) * 0.055;
  float crumbGuide = 1.0 - abs(nscNoise((point + crumbWarp) / 0.082, 969.0));
  float crumbBreak = abs(nscNoise((point - crumbWarp) / 0.051, 973.0));
  float fibreCrumb = pow(clamp(crumbGuide, 0.0, 1.0), 2.7)
    * smoothstep(0.34, 0.8, crumbBreak)
    * nscFade(0.082, footprint);
  float fibreCluster = smoothstep(
    0.42,
    0.78,
    nscNoise((point + fibreWarp * 0.35) / 0.82, 961.0) * 0.5 + 0.5
  );
  fibre = clamp(fibreCrumple * 0.82 + fibreCrumb * 0.38, 0.0, 1.0)
    * (0.24 + fibreCluster * 0.76)
    * nscFade(0.21, footprint)
    * (0.42 + nsvOctave3 * 0.48);
  litter = smoothstep(0.54, 0.82, nsvOctave2 * 0.58 + nsvOctave4 * 0.55)
    * (0.42 + fibre * 0.58);
  height += fibreCrumple * fibreCluster * 0.011 * nscFade(0.21, footprint);
  height += fibreCrumb * fibreCluster * 0.0038;
}

// Close moss uses Kallur's accepted carrier hand-off, not its grass shape.
// The broad heath cascade already makes connected sponge-like cushions. This
// band adds only their dense signed nap: no positive domes, no droplets and
// no upright blades. Each scale fades by its own pixel footprint.
void nsvMossVelvet(
  vec2 point,
  float footprint,
  out float height,
  out float nap
) {
  vec2 mossWarp = vec2(
    nscNoise(point / ${glslNumber(moss.warpWavelength)}, ${glslNumber(moss.warpSeedA)}),
    nscNoise(point / ${glslNumber(moss.warpWavelength * 1.17)}, ${glslNumber(moss.warpSeedB)})
  ) * ${glslNumber(moss.warpAmplitude)};
  float mossNapA = nscNoise(
    (point + mossWarp) / ${glslNumber(moss.napWavelengthA)},
    ${glslNumber(moss.seedA)}
  );
  float mossNapB = nscNoise(
    (point - mossWarp * 0.72) / ${glslNumber(moss.napWavelengthB)},
    ${glslNumber(moss.seedB)}
  );
  float mossCluster = smoothstep(
    0.34,
    0.78,
    nscNoise(point / ${glslNumber(moss.clusterWavelength)}, ${glslNumber(moss.clusterSeed)}) * 0.5 + 0.5
  );
  float napFadeA = nscFade(${glslNumber(moss.napWavelengthA)}, footprint);
  float napFadeB = nscFade(${glslNumber(moss.fadeWavelength)}, footprint);
  float signedNap = mossNapA * 0.58 * napFadeA
    + mossNapB * 0.42 * napFadeB;
  height = signedNap * (
    ${glslNumber(moss.heightBase)}
    + mossCluster * ${glslNumber(moss.heightCluster)}
  );
  nap = clamp(0.5 + signedNap * 0.5, 0.0, 1.0) * napFadeB;
}

// Short village turf. A slow colony mask chooses between two FIXED world-space
// frames, then a second fine field chops every anisotropic stroke into pieces.
// Never rotate the absolute point by an angle(point): d(R(point)*point) grows
// with distance from the origin and creates radial moire in derivative normals.
void nsvGrassNap(
  vec2 point,
  float footprint,
  out float height,
  out float blade
) {
  vec2 grassWarp = vec2(
    nscNoise(point / ${glslNumber(grass.warpWavelength)}, ${glslNumber(grass.warpSeedA)}),
    nscNoise(point / ${glslNumber(grass.warpWavelength * 1.13)}, ${glslNumber(grass.warpSeedB)})
  ) * ${glslNumber(grass.warpAmplitude)};
  vec2 grassPoint = point + grassWarp;
  vec2 grassFrameA = vec2(
    grassPoint.x * ${glslNumber(Math.cos(grass.angleA))} - grassPoint.y * ${glslNumber(Math.sin(grass.angleA))},
    grassPoint.x * ${glslNumber(Math.sin(grass.angleA))} + grassPoint.y * ${glslNumber(Math.cos(grass.angleA))}
  );
  vec2 grassFrameB = vec2(
    grassPoint.x * ${glslNumber(Math.cos(grass.angleB))} - grassPoint.y * ${glslNumber(Math.sin(grass.angleB))},
    grassPoint.x * ${glslNumber(Math.sin(grass.angleB))} + grassPoint.y * ${glslNumber(Math.cos(grass.angleB))}
  );
  float bladeCarrierA = nscNoise(
    vec2(
      grassFrameA.x / ${glslNumber(grass.bladeWidth)},
      grassFrameA.y / ${glslNumber(grass.bladeLength)}
    ),
    ${glslNumber(grass.bladeSeed)}
  ) * 0.5 + 0.5;
  float bladeCarrierB = nscNoise(
    vec2(
      grassFrameB.x / ${glslNumber(grass.bladeWidth)},
      grassFrameB.y / ${glslNumber(grass.bladeLength)}
    ),
    ${glslNumber(grass.bladeSeed + 17)}
  ) * 0.5 + 0.5;
  float bladeBreak = nscNoise(
    (point - grassWarp * 0.4) / ${glslNumber(grass.breakAcross)},
    ${glslNumber(grass.breakSeed)}
  ) * 0.5 + 0.5;
  float grassChoice = smoothstep(
    0.42,
    0.58,
    nscNoise(point / ${glslNumber(grass.choiceWavelength)}, ${glslNumber(grass.choiceSeed)}) * 0.5 + 0.5
  );
  float bladeCarrier = mix(bladeCarrierA, bladeCarrierB, grassChoice);
  float grassCluster = smoothstep(
    0.28,
    0.74,
    nscNoise(point / ${glslNumber(grass.clusterWavelength)}, ${glslNumber(grass.clusterSeed)}) * 0.5 + 0.5
  );
  float grassFade = nscFade(${glslNumber(grass.fadeWavelength)}, footprint);
  blade = smoothstep(0.46, 0.82, bladeCarrier)
    * smoothstep(0.26, 0.68, bladeBreak)
    * (0.52 + grassCluster * 0.48)
    * grassFade;
  height = blade * (
    ${glslNumber(grass.heightBase)}
    + grassCluster * ${glslNumber(grass.heightCrown)}
  );
}

// Boot-churned path material. A slow mask chooses between fixed smear frames,
// then isotropic breaks and crumbs interrupt them. The leaf cell is heavily
// jittered and sparse; it supplies occasional flat organic silhouettes rather
// than a repeated decal sheet. As above, never rotate an absolute coordinate
// by a varying angle: that was the source of the radial derivative explosion.
void nsvMudClose(
  vec2 point,
  float footprint,
  out float height,
  out float churn,
  out float hollow,
  out float leaf,
  out float leafTone
) {
  vec2 mudWarp = vec2(
    nscNoise(point / ${glslNumber(mud.warpWavelength)}, ${glslNumber(mud.warpSeedA)}),
    nscNoise(point / ${glslNumber(mud.warpWavelength * 1.21)}, ${glslNumber(mud.warpSeedB)})
  ) * ${glslNumber(mud.warpAmplitude)};
  vec2 mudPoint = point + mudWarp;
  vec2 mudFrameA = vec2(
    mudPoint.x * ${glslNumber(Math.cos(mud.angleA))} - mudPoint.y * ${glslNumber(Math.sin(mud.angleA))},
    mudPoint.x * ${glslNumber(Math.sin(mud.angleA))} + mudPoint.y * ${glslNumber(Math.cos(mud.angleA))}
  );
  vec2 mudFrameB = vec2(
    mudPoint.x * ${glslNumber(Math.cos(mud.angleB))} - mudPoint.y * ${glslNumber(Math.sin(mud.angleB))},
    mudPoint.x * ${glslNumber(Math.sin(mud.angleB))} + mudPoint.y * ${glslNumber(Math.cos(mud.angleB))}
  );
  float mudSmearA = nscNoise(
    vec2(
      mudFrameA.x / ${glslNumber(mud.smearAcross)},
      mudFrameA.y / ${glslNumber(mud.smearAlong)}
    ),
    ${glslNumber(mud.smearSeed)}
  );
  float mudSmearB = nscNoise(
    vec2(
      mudFrameB.x / ${glslNumber(mud.smearAcross)},
      mudFrameB.y / ${glslNumber(mud.smearAlong)}
    ),
    ${glslNumber(mud.smearSeed + 19)}
  );
  float mudChoice = smoothstep(
    0.42,
    0.58,
    nscNoise(point / ${glslNumber(mud.choiceWavelength)}, ${glslNumber(mud.choiceSeed)}) * 0.5 + 0.5
  );
  float mudSmear = mix(mudSmearA, mudSmearB, mudChoice);
  float mudBreak = abs(nscNoise(
    (point - mudWarp * 0.55) / ${glslNumber(mud.breakWavelength)},
    ${glslNumber(mud.breakSeed)}
  ));
  float mudCrumb = nscNoise(
    (point + mudWarp * 0.2) / ${glslNumber(mud.crumbWavelength)},
    ${glslNumber(mud.crumbSeed)}
  );
  float smearFade = nscFade(${glslNumber(mud.fadeWavelength)}, footprint);
  float crumbFade = nscFade(${glslNumber(mud.crumbWavelength)}, footprint);
  float signedChurn = mudSmear * (0.34 + mudBreak * 0.66) * smearFade;
  churn = clamp(0.5 + signedChurn * 0.5 + mudCrumb * 0.12 * crumbFade, 0.0, 1.0);
  hollow = smoothstep(0.55, 0.88, 0.5 - signedChurn * 0.5)
    * smoothstep(0.18, 0.72, mudBreak)
    * smearFade;

  vec2 leafCell = floor(point / ${glslNumber(mud.leafCell)});
  vec2 leafFraction = fract(point / ${glslNumber(mud.leafCell)}) - 0.5;
  vec2 leafOffset = vec2(
    nscHash(leafCell, ${glslNumber(mud.leafOffsetSeedA)}),
    nscHash(leafCell, ${glslNumber(mud.leafOffsetSeedB)})
  ) - 0.5;
  vec2 leafPoint = (leafFraction - leafOffset * 0.3) * ${glslNumber(mud.leafCell)};
  float leafAngle = nscHash(leafCell, ${glslNumber(mud.leafAngleSeed)}) * 6.2831853;
  float leafCosine = cos(leafAngle);
  float leafSine = sin(leafAngle);
  vec2 leafFrame = vec2(
    leafPoint.x * leafCosine - leafPoint.y * leafSine,
    leafPoint.x * leafSine + leafPoint.y * leafCosine
  );
  float leafShape = abs(leafFrame.x) / ${glslNumber(mud.leafLength * 0.5)}
    + pow(abs(leafFrame.y) / ${glslNumber(mud.leafWidth * 0.5)}, 1.35);
  float leafPresent = step(
    ${glslNumber(mud.leafPresence)},
    nscHash(leafCell, ${glslNumber(mud.leafSeed)})
  );
  leaf = (1.0 - smoothstep(0.78, 1.0, leafShape))
    * leafPresent
    * nscFade(${glslNumber(mud.leafFadeWavelength)}, footprint);
  leafTone = nscHash(leafCell, ${glslNumber(mud.leafToneSeed)});
  height = signedChurn * ${glslNumber(mud.heightSmear)}
    + mudCrumb * ${glslNumber(mud.heightCrumb)} * crumbFade
    + leaf * 0.0012;
}

vec3 nsvHeathAlbedo(
  vec2 point,
  float footprint,
  float cushions,
  float fibre,
  float litter,
  float moss,
  float litness
) {
  vec3 heath = mix(${glslColor(p.base)}, ${glslColor(p.alt)}, clamp(cushions, 0.0, 1.0));
  vec2 matWarp = vec2(
    nscNoise(point / 0.81, 971.0),
    nscNoise(point / 0.63, 977.0)
  ) * 0.11;
  float mat = abs(nscNoise((point + matWarp) / 0.34, 983.0));
  float pock = abs(nscNoise((point - matWarp * 0.6) / 0.145, 991.0));
  mat = mix(0.45, mat, nscFade(0.34, footprint));
  pock = mix(0.45, pock, nscFade(0.145, footprint));
  heath = mix(heath, ${glslColor(p.seamDark)}, pow(1.0 - cushions, 1.8) * 0.48);
  heath = mix(heath, ${glslColor(p.lit)}, smoothstep(0.5, 0.86, cushions) * 0.34);
  float feltHollow = pow(1.0 - mat, 2.4);
  float feltCrown = smoothstep(0.58, 0.9, mat * 0.68 + pock * 0.42);
  heath = mix(heath, ${glslColor(p.seamDark)}, feltHollow * 0.58);
  heath = mix(heath, ${glslColor(p.lit)}, feltCrown * 0.39);
  heath = mix(heath, ${glslColor(p.moss)}, moss * 0.82);
  heath = mix(heath, ${glslColor(p.thatch)}, litter * (0.3 + pock * 0.34));
  heath = mix(heath, ${glslColor(p.straw)}, fibre * (0.17 + litness * 0.2));
  float grain = nscNoise(point / 0.043, 967.0) * nscFade(0.043, footprint) * 0.5
    + nscNoise(point / 0.083, 969.0) * nscFade(0.083, footprint) * 0.5;
  heath *= 1.0 + grain * (0.075 + litness * 0.095);
  return heath;
}
`;
}

/** GLSL `nscHash` / `nscNoise` on the CPU so scatter sits on the same crests. */
function cascadeHash(ix: number, iz: number, seed: number): number {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function cascadeSmoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Value noise in [-1, 1], hermite interpolation matching the band. */
export function kallurCascadeNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = cascadeSmoothstep(x - ix);
  const fz = cascadeSmoothstep(z - iz);
  const a = cascadeHash(ix, iz, seed);
  const b = cascadeHash(ix + 1, iz, seed);
  const c = cascadeHash(ix, iz + 1, seed);
  const d = cascadeHash(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

export function kallurCascadeOctaveAt(
  x: number,
  z: number,
  octave: CascadeOctave,
): number {
  const cosine = Math.cos(octave.angle);
  const sine = Math.sin(octave.angle);
  const sample = kallurCascadeNoise(
    (x * cosine - z * sine) / (octave.wavelength * octave.stretch),
    (x * sine + z * cosine) / octave.wavelength,
    octave.seed,
  );
  return octave.billow ? Math.abs(sample) : sample * 0.5 + 0.5;
}

/**
 * Crest of cascade octaves 3 and 4 — the pile strokes the standing strands
 * grow on. Same seeds as `nscCarpetHeight`; ridge in [0, 1].
 */
export function kallurCascadeRidgeAt(x: number, z: number): number {
  const third = kallurCascadeOctaveAt(x, z, KALLUR_CASCADE[3]);
  const fourth = kallurCascadeOctaveAt(x, z, KALLUR_CASCADE[4]);
  return Math.max(0, Math.min(1, third * 0.65 + fourth * 0.35));
}

/** Lab `stemClusterAt` — CPU twin of GLSL `nscStemCluster`. */
export function kallurStemClusterAt(x: number, z: number): number {
  const third = kallurCascadeOctaveAt(x, z, KALLUR_CASCADE[3]);
  const fourth = kallurCascadeOctaveAt(x, z, KALLUR_CASCADE[4]);
  return Math.max(0, Math.min(1, (third * 0.8 + fourth * 0.6) * 1.2 - 0.1));
}

/** Lab `spikeAt` — CPU twin of GLSL `nscSpike`. */
export function kallurSpikeAt(x: number, z: number): number {
  const stem = KALLUR_NEAR_STEM;
  const a = Math.abs(
    kallurCascadeNoise(
      (x * stem.rotA.c - z * stem.rotA.s) / stem.wavelengthA,
      (x * stem.rotA.s + z * stem.rotA.c) / stem.stretchA,
      stem.seedA,
    ),
  );
  const b = Math.abs(
    kallurCascadeNoise(
      (x * stem.rotB.c + z * stem.rotB.s) / stem.wavelengthB,
      (x * -stem.rotB.s + z * stem.rotB.c) / stem.stretchB,
      stem.seedB,
    ),
  );
  const ridge = Math.max(1 - a, 1 - b);
  return ridge * ridge;
}
