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

/** Lab tile Y masses, verbatim — the octave the field was missing. */
export const KALLUR_TONAL_MASSES = {
  wavelength: 6.5,
  amplitude: 0.55,
  seed: 601,
} as const;

/** Measured Kallur palette (kallur-brief.md), shared with the lab. */
export const KALLUR_CARPET_PALETTE = {
  base: "#6d7046",
  alt: "#757641",
  lit: "#b3b374",
  seamDark: "#3a4426",
  moss: "#8f8d52",
  straw: "#c7c084",
  thatch: "#71603a",
} as const;

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
