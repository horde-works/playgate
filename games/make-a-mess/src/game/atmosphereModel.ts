/**
 * The air itself, as one law.
 *
 * Everything the worlds call "light" comes out of this file: the colour of the
 * sky in a given direction, the colour and strength of the beam that reaches
 * the ground, the fill that falls out of the whole dome, and the colour a
 * cumulus is lit and shaded with. They are not four authored moods that have
 * to be kept in step by hand — they are four questions asked of the same
 * atmosphere, so they cannot disagree about what hour it is.
 *
 * WHY NOT THE ANALYTIC SKY WE HAD. Preetham is a DAYTIME model: single
 * scattering, fitted to a sun that is up. Below about five degrees it comes
 * apart in exactly the way a sunset is judged by — measured on our own
 * exposure, twelve degrees above a sun on the horizon rendered 162,159,144,
 * eighteen levels of chroma, and twelve degrees BEHIND the observer rendered
 * 94,100,93, which is grey to within rounding. So the warm band was five
 * degrees tall and everything above it was a grey-blue ceiling.
 *
 * Two things are missing from that model and both are physical:
 *
 * 1. OZONE. Rayleigh and Mie alone give a twilight that goes brown-grey,
 *    because the long path has already had the blue taken out of it. Ozone
 *    absorbs in the Chappuis band — orange and green, almost no blue — and it
 *    lives at 25 km, well above the dust. At noon its path is short and it does
 *    nothing; at dusk the beam crosses it nearly lengthwise and it is what
 *    keeps the upper sky BLUE over an orange horizon. It is the single term
 *    that turns a muddy sunset into the one in the photograph.
 * 2. THE SUN'S OWN PATH TO THE SCATTERING POINT. Where that path is blocked by
 *    the planet the air is simply not lit — which is the Earth's shadow — and
 *    just above it sits the band still lit by a reddened beam: the Belt of
 *    Venus. Measured against the old sky, four degrees up on the anti-solar
 *    horizon goes from 98,84,59 to 188,130,78, from 39 levels of chroma to 110.
 *
 * The cost of being right is a march rather than a formula. What makes that
 * affordable is that the expensive part of it — how much light survives the
 * trip from a point in the air out to space — depends on nothing that changes
 * during play, and so is built once into `transmittanceTable`.
 */

/**
 * Every constant the air is made of. The sky shader is generated from this
 * object (`airShaderFunctions` in `skyClouds`), so the GPU and this file
 * cannot drift apart in calibration the way two hand-written copies of the
 * same four numbers always do.
 *
 * Scattering and absorption coefficients are per metre at sea level, at
 * 680/550/440 nm — the standard set used by precomputed-scattering renderers,
 * not numbers tuned until a frame looked nice.
 */
export const AIR_LAW = {
  /** Planet and the top of its air, in metres. */
  planetRadius: 6360e3,
  atmosphereRadius: 6460e3,

  /** Rayleigh: the blue. Scattering only — nitrogen does not absorb. */
  rayleighScatter: [5.802e-6, 13.558e-6, 33.1e-6] as const,
  rayleighHeight: 8000,

  /**
   * Mie: the haze. Grey, forward-throwing, and it DOES absorb — about a tenth
   * of what it scatters for clean air, far more over a city. Without the
   * absorption a hazy sky brightens instead of dulling.
   */
  mieScatter: 3.996e-6,
  mieAbsorb: 4.4e-7,
  mieHeight: 1200,
  mieG: 0.8,

  /**
   * Ozone: absorption only, and only in the middle of the spectrum. The layer
   * is a tent centred at 25 km — it is not tied to the ground the way the
   * other two are, which is why its effect appears only when the beam runs
   * along it.
   */
  ozoneAbsorb: [0.65e-6, 1.881e-6, 0.085e-6] as const,
  ozoneCentre: 25000,
  ozoneWidth: 15000,

  /**
   * The one anchor between physics and the renderer's units. Chosen so a clear
   * noon zenith leaves this model at 0.42 linear — about a stop and a half over
   * middle grey, which is where AgX still holds colour and is exactly where the
   * previous sky was pinned. Every other brightness in the file follows from
   * it; there is no second exposure knob to fight with.
   */
  solarIrradiance: 48.3,

  /**
   * Author ceiling for the live GPU view march at gpuQuality 2. Distributed
   * quadratically — see GLSL `airRadiance`. Cut from 24 to 16 once phase dither
   * and elevation adaptive count landed: the transmittance and multi-scatter
   * tables already hold the expensive integrals, and a flat 24 at every pixel
   * was the shared idle-FPS regression across worlds.
   */
  viewSteps: 16,
  /**
   * CPU lighting queries (`skyRadiance` → key, fill, fog). Paid a few times
   * per degree of solar elevation, not per pixel — keep the denser integrand
   * so noon anchors and twilight curves do not track the live GPU budget.
   */
  cpuViewSteps: 24,
  /**
   * Live-frame air step ceilings for gpuQuality 0 / 1 / 2. Bake still forces
   * `coarseViewSteps` via `uAirCoarse`. Quality is a descent FROM the author
   * max, never a lowered authorship floor.
   */
  qualityViewSteps: [6, 10, 16] as const,
  /**
   * At the zenith, fraction of the quality ceiling that is actually walked.
   * Horizon / twilight keep the full ceiling (ozone path, Belt of Venus).
   */
  zenithStepScale: 0.55,
  /**
   * Steps the environment bake uses. `three-stdlib` hands every `Sky` one
   * material, so a PMREM relight draws the visible sky's own shader six times;
   * what survives that blur is an average brightness, not a gradient.
   */
  coarseViewSteps: 6,
  /** Steps used to BUILD the transmittance table, paid once at startup. */
  transmittanceSteps: 40,
  /**
   * Multiple scattering: directions sampled over the sphere and steps along
   * each, for the table built once at startup. Both are small on purpose —
   * what this term contributes is smooth by construction, it is the LIGHT THAT
   * HAS ALREADY BOUNCED and therefore has no direction left in it.
   */
  multiScatterDirections: 8,
  multiScatterSteps: 16,

  /**
   * How far below the horizon the beam is still tracked. Civil twilight ends
   * near -6°; past -9° the ground gets nothing this model can carry and the
   * night lighting owns the frame.
   */
  twilightFloor: -9,
} as const;

const TOP_HEIGHT = AIR_LAW.atmosphereRadius - AIR_LAW.planetRadius;

/**
 * How much aerosol this world's air carries, relative to clean country air.
 *
 * The ONE thing a world still authors about its atmosphere — nitrogen and
 * ozone are the same everywhere, dust is not. It is a module-level setting
 * rather than an argument threaded through every function because it changes
 * exactly once, when a world loads, and because the tables below are keyed by
 * it: if the beam and the dome were allowed to hold different values of this,
 * they would go back to being two skies.
 */
let haze = 1;

export function airHaze(): number {
  return haze;
}

export function setAirHaze(value: number): void {
  haze = Math.max(0, value);
}

/** Scattering and absorbing Mie coefficients for the air as currently set. */
const mieScatter = () => AIR_LAW.mieScatter * haze;
const mieExtinct = () => (AIR_LAW.mieScatter + AIR_LAW.mieAbsorb) * haze;

/** Relative density of each species at a height above sea level. */
export function airDensity(height: number): [number, number, number] {
  return [
    Math.exp(-height / AIR_LAW.rayleighHeight),
    Math.exp(-height / AIR_LAW.mieHeight),
    Math.max(0, 1 - Math.abs(height - AIR_LAW.ozoneCentre) / AIR_LAW.ozoneWidth),
  ];
}

/** Extinction per metre for each channel at a height. Scatter plus absorb. */
export function airExtinction(height: number): [number, number, number] {
  const [rayleigh, mie, ozone] = airDensity(height);
  const mieTotal = mieExtinct() * mie;
  return [0, 1, 2].map((channel) =>
    AIR_LAW.rayleighScatter[channel] * rayleigh
    + mieTotal
    + AIR_LAW.ozoneAbsorb[channel] * ozone) as [number, number, number];
}

// ---------------------------------------------------------------------------
// Geometry. A ray in planet-centred coordinates; the observer stands at the
// top of the planet so "up" is +y and an elevation is a real elevation.
// ---------------------------------------------------------------------------

function shellDistance(radius: number, mu: number, shell: number): number {
  // Distance to the shell of the given radius along a ray leaving `radius` at
  // cosine `mu` from the local vertical. Negative discriminant means it misses.
  const discriminant = radius * radius * (mu * mu - 1) + shell * shell;
  if (discriminant < 0) return -1;
  return -radius * mu + Math.sqrt(discriminant);
}

/** Does a ray leaving this radius at this cosine run into the planet? */
export function hitsGround(radius: number, mu: number): boolean {
  return mu < 0
    && radius * radius * (mu * mu - 1) + AIR_LAW.planetRadius ** 2 >= 0;
}

/** Length of air a ray crosses before it leaves the atmosphere or lands. */
export function airPathLength(radius: number, mu: number): number {
  if (hitsGround(radius, mu)) {
    const ground = -radius * mu
      - Math.sqrt(radius * radius * (mu * mu - 1) + AIR_LAW.planetRadius ** 2);
    return Math.max(0, ground);
  }
  return Math.max(0, shellDistance(radius, mu, AIR_LAW.atmosphereRadius));
}

// ---------------------------------------------------------------------------
// Transmittance table: how much of each colour survives the trip from a point
// at some altitude, along some direction, out through the top of the air.
//
// This is the only expensive integral in the model and it depends on NOTHING
// that changes — not the hour, not the world, not the weather. It is built
// once and then answered by lookup, on the CPU here and in the shader from the
// same bytes. That is what makes a per-pixel march affordable at all: the inner
// loop of a scattering integral is this table.
// ---------------------------------------------------------------------------

/** Cosines below this never see the sun; kept for resolution near the horizon. */
const MU_FLOOR = -0.35;
export const TRANSMITTANCE_WIDTH = 256;
export const TRANSMITTANCE_HEIGHT = 64;

/** Table coordinate for a cosine, and back. Linear: the table is wide. */
const muToU = (mu: number) => (mu - MU_FLOOR) / (1 - MU_FLOOR);
const uToMu = (u: number) => MU_FLOOR + u * (1 - MU_FLOOR);
/**
 * Height is square-rooted so half the rows sit in the lowest quarter of the
 * air, where the density actually moves.
 */
const heightToV = (height: number) => Math.sqrt(Math.max(0, height) / TOP_HEIGHT);
const vToHeight = (v: number) => v * v * TOP_HEIGHT;

function integrateTransmittance(
  radius: number,
  mu: number,
  out: [number, number, number],
): void {
  if (hitsGround(radius, mu)) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const path = airPathLength(radius, mu);
  const steps = AIR_LAW.transmittanceSteps;
  let depthR = 0;
  let depthM = 0;
  let depthO = 0;
  for (let step = 0; step < steps; step += 1) {
    const t = (path * (step + 0.5)) / steps;
    const height = Math.sqrt(radius * radius + t * t + 2 * radius * t * mu)
      - AIR_LAW.planetRadius;
    const [rayleigh, mie, ozone] = airDensity(height);
    const span = path / steps;
    depthR += rayleigh * span;
    depthM += mie * span;
    depthO += ozone * span;
  }
  const mieTotal = mieExtinct() * depthM;
  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] = Math.exp(
      -(AIR_LAW.rayleighScatter[channel] * depthR
        + mieTotal
        + AIR_LAW.ozoneAbsorb[channel] * depthO),
    );
  }
}

/** Keyed by haze: a world's air is fixed, but a session may visit several. */
const cachedTransmittance = new Map<number, Float32Array>();

/** The one table. RGB per texel, row-major, `TRANSMITTANCE_WIDTH` wide. */
export function transmittanceTable(): Float32Array {
  const cached = cachedTransmittance.get(haze);
  if (cached) return cached;
  const table = new Float32Array(TRANSMITTANCE_WIDTH * TRANSMITTANCE_HEIGHT * 3);
  const sample: [number, number, number] = [0, 0, 0];
  for (let row = 0; row < TRANSMITTANCE_HEIGHT; row += 1) {
    const height = vToHeight((row + 0.5) / TRANSMITTANCE_HEIGHT);
    const radius = AIR_LAW.planetRadius + height;
    for (let column = 0; column < TRANSMITTANCE_WIDTH; column += 1) {
      integrateTransmittance(
        radius,
        uToMu((column + 0.5) / TRANSMITTANCE_WIDTH),
        sample,
      );
      const offset = (row * TRANSMITTANCE_WIDTH + column) * 3;
      table[offset] = sample[0];
      table[offset + 1] = sample[1];
      table[offset + 2] = sample[2];
    }
  }
  cachedTransmittance.set(haze, table);
  return table;
}

/** Bilinear lookup, matching what the shader's sampler does. */
export function transmittanceAt(
  height: number,
  mu: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const table = transmittanceTable();
  const x = Math.min(
    TRANSMITTANCE_WIDTH - 1.0001,
    Math.max(0, muToU(mu) * TRANSMITTANCE_WIDTH - 0.5),
  );
  const y = Math.min(
    TRANSMITTANCE_HEIGHT - 1.0001,
    Math.max(0, heightToV(height) * TRANSMITTANCE_HEIGHT - 0.5),
  );
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(TRANSMITTANCE_WIDTH - 1, x0 + 1);
  const y1 = Math.min(TRANSMITTANCE_HEIGHT - 1, y0 + 1);
  for (let channel = 0; channel < 3; channel += 1) {
    const a = table[(y0 * TRANSMITTANCE_WIDTH + x0) * 3 + channel];
    const b = table[(y0 * TRANSMITTANCE_WIDTH + x1) * 3 + channel];
    const c = table[(y1 * TRANSMITTANCE_WIDTH + x0) * 3 + channel];
    const d = table[(y1 * TRANSMITTANCE_WIDTH + x1) * 3 + channel];
    out[channel] = (a * (1 - fx) + b * fx) * (1 - fy)
      + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Multiple scattering: the light that has already bounced.
//
// Single scattering alone gets twilight wrong in two ways at once, and both
// were visible the moment the model was first plotted. The zenith over a
// setting sun came out 75,71,83 — a neutral grey, when the whole argument for
// modelling ozone is that this patch of sky stays BLUE. And the Belt of Venus
// came out at 110 levels of chroma, a raw orange rather than the pink band a
// photograph shows. Both are the same omission: at dusk the beam is so
// reddened that first-bounce light carries almost no blue anywhere, and what
// actually fills the upper sky is light that scattered high up, where the air
// is still lit white, and then scattered AGAIN on its way to the eye.
//
// The cloud deck already reasons this way (`CLOUD_LAW.scatterOctaves`). The
// air needs the same, and gets it the same way it gets everything expensive:
// as a small table, built once, indexed by the only two things it depends on —
// how high the point is and where the sun is from there.
// ---------------------------------------------------------------------------

export const MULTI_SCATTER_SIZE = 32;

const cachedMultiScatter = new Map<number, Float32Array>();

function scatterCoefficients(
  height: number,
  out: [number, number, number],
): [number, number, number] {
  const [rayleigh, mie] = airDensity(height);
  const scatter = mieScatter();
  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] = AIR_LAW.rayleighScatter[channel] * rayleigh + scatter * mie;
  }
  return out;
}

/**
 * For one point in the air: how much second-order light arrives from all
 * directions, and how much of ANY light passing through gets scattered onward.
 * The ratio of the two closes the infinite series of further bounces — each
 * one fainter by the same factor — into a single number.
 */
function integrateMultiScatter(
  height: number,
  muSun: number,
  out: [number, number, number],
): void {
  const radius = AIR_LAW.planetRadius + height;
  const sun: Direction = [Math.sqrt(Math.max(0, 1 - muSun * muSun)), muSun, 0];
  const second: [number, number, number] = [0, 0, 0];
  const spread: [number, number, number] = [0, 0, 0];
  const sunTransmit: [number, number, number] = [0, 0, 0];
  const scatter: [number, number, number] = [0, 0, 0];
  const directions = AIR_LAW.multiScatterDirections;
  const isotropic = 1 / (4 * Math.PI);

  for (let index = 0; index < directions; index += 1) {
    // A spiral over the sphere: uniform in cos, golden-angle in azimuth. Eight
    // of these cover a function with no lobes left in it perfectly well.
    const cosine = 1 - (2 * (index + 0.5)) / directions;
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    const azimuth = index * 2.399963;
    const ray: Direction = [
      Math.cos(azimuth) * sine,
      cosine,
      Math.sin(azimuth) * sine,
    ];
    const path = airPathLength(radius, ray[1]);
    if (path <= 0) continue;
    const steps = AIR_LAW.multiScatterSteps;
    const span = path / steps;
    const cosSun = ray[0] * sun[0] + ray[1] * sun[1] + ray[2] * sun[2];
    let depthR = 0;
    let depthM = 0;
    let depthO = 0;
    for (let step = 0; step < steps; step += 1) {
      const t = span * (step + 0.5);
      const sampleRadius = Math.sqrt(
        radius * radius + t * t + 2 * radius * t * ray[1],
      );
      const sampleHeight = sampleRadius - AIR_LAW.planetRadius;
      const [rayleigh, mie, ozone] = airDensity(sampleHeight);
      depthR += rayleigh * span;
      depthM += mie * span;
      depthO += ozone * span;
      const mieTotal = mieExtinct() * depthM;
      scatterCoefficients(sampleHeight, scatter);
      transmittanceAt(
        sampleHeight,
        (radius * muSun + t * cosSun) / sampleRadius,
        sunTransmit,
      );
      for (let channel = 0; channel < 3; channel += 1) {
        const viewTransmit = Math.exp(
          -(AIR_LAW.rayleighScatter[channel] * depthR
            + mieTotal
            + AIR_LAW.ozoneAbsorb[channel] * depthO),
        );
        const reaching = viewTransmit * scatter[channel] * span;
        second[channel] += reaching * sunTransmit[channel];
        spread[channel] += reaching;
      }
    }
  }

  for (let channel = 0; channel < 3; channel += 1) {
    // Both are averages over the sphere, so both are divided by the number of
    // directions and NOT multiplied by 4π: the 4π of the solid angle and the
    // 1/4π of an isotropic phase are the same factor and cancel. Applying
    // both to the second-order term made it 4π too large, which showed up
    // exactly as it should have — a noon zenith three times too bright and a
    // sunset with the colour washed back out of it.
    const scattered = (second[channel] / directions) * isotropic;
    // How much of a uniform ambient field this point scatters onward. The
    // geometric series of every further bounce closes into one division.
    const onward = Math.min(0.95, spread[channel] / directions);
    out[channel] = scattered / (1 - onward);
  }
}

/** The one multiple-scattering table. RGB per texel, `MULTI_SCATTER_SIZE` wide. */
export function multiScatterTable(): Float32Array {
  const cached = cachedMultiScatter.get(haze);
  if (cached) return cached;
  // The transmittance table is its inner loop; build it first, deliberately.
  transmittanceTable();
  const size = MULTI_SCATTER_SIZE;
  const table = new Float32Array(size * size * 3);
  const sample: [number, number, number] = [0, 0, 0];
  for (let row = 0; row < size; row += 1) {
    const height = vToHeight((row + 0.5) / size);
    for (let column = 0; column < size; column += 1) {
      integrateMultiScatter(height, uToMu((column + 0.5) / size), sample);
      const offset = (row * size + column) * 3;
      table[offset] = sample[0];
      table[offset + 1] = sample[1];
      table[offset + 2] = sample[2];
    }
  }
  cachedMultiScatter.set(haze, table);
  return table;
}

/** Bilinear lookup into the multiple-scattering table. */
export function multiScatterAt(
  height: number,
  muSun: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const table = multiScatterTable();
  const size = MULTI_SCATTER_SIZE;
  const x = Math.min(size - 1.0001, Math.max(0, muToU(muSun) * size - 0.5));
  const y = Math.min(size - 1.0001, Math.max(0, heightToV(height) * size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  for (let channel = 0; channel < 3; channel += 1) {
    const a = table[(y0 * size + x0) * 3 + channel];
    const b = table[(y0 * size + x1) * 3 + channel];
    const c = table[(y1 * size + x0) * 3 + channel];
    const d = table[(y1 * size + x1) * 3 + channel];
    out[channel] = (a * (1 - fx) + b * fx) * (1 - fy)
      + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase functions
// ---------------------------------------------------------------------------

export function rayleighPhase(cosAngle: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosAngle * cosAngle);
}

export function miePhase(cosAngle: number): number {
  const g = AIR_LAW.mieG;
  const g2 = g * g;
  return (
    (3 / (8 * Math.PI))
    * ((1 - g2) * (1 + cosAngle * cosAngle))
    / ((2 + g2) * Math.pow(1 + g2 - 2 * g * cosAngle, 1.5))
  );
}

// ---------------------------------------------------------------------------
// The sky
// ---------------------------------------------------------------------------

export type Direction = readonly [x: number, y: number, z: number];

/**
 * Radiance of the sky in one direction, in the renderer's linear units.
 *
 * Single scattering, marched. Samples are placed quadratically along the ray
 * because a grazing view crosses hundreds of kilometres of air, nearly all of
 * whose scattering happens in the first few: an even march spends its whole
 * budget on empty high air and aliases the part that is actually bright.
 *
 * `sun` may be below the horizon. That is not a special case here — the
 * transmittance lookup simply returns zero for any sample the planet stands in
 * front of, which is the Earth's shadow, and the samples above it are still lit
 * by a beam that has been reddened by its own long path. Twilight is not
 * authored anywhere in this file; it is what the geometry does on its own.
 */
export function skyRadiance(
  direction: Direction,
  sun: Direction,
  eyeHeight = 2,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const radius = AIR_LAW.planetRadius + eyeHeight;
  const mu = direction[1];
  const path = airPathLength(radius, mu);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  if (path <= 0) return out;

  const cosSun = direction[0] * sun[0] + direction[1] * sun[1] + direction[2] * sun[2];
  const phaseR = rayleighPhase(cosSun);
  const phaseM = miePhase(cosSun);
  const steps = AIR_LAW.cpuViewSteps;

  let depthR = 0;
  let depthM = 0;
  let depthO = 0;
  const sunTransmit: [number, number, number] = [0, 0, 0];
  const bounced: [number, number, number] = [0, 0, 0];
  let previous = 0;
  for (let step = 0; step < steps; step += 1) {
    const far = (path * (step + 1) * (step + 1)) / (steps * steps);
    const span = far - previous;
    const t = (previous + far) * 0.5;
    previous = far;

    const sampleRadius = Math.sqrt(radius * radius + t * t + 2 * radius * t * mu);
    const height = sampleRadius - AIR_LAW.planetRadius;
    const [rayleigh, mie, ozone] = airDensity(height);
    depthR += rayleigh * span;
    depthM += mie * span;
    depthO += ozone * span;

    // Cosine of the sun at THIS sample, not at the eye: along a ray hundreds
    // of kilometres long the local vertical rotates, which is how the far end
    // can still be in sunlight while the near end is already in shadow.
    const upDotSun = (radius * sun[1] + t * cosSun) / sampleRadius;
    transmittanceAt(height, upDotSun, sunTransmit);
    multiScatterAt(height, upDotSun, bounced);

    const mieTotal = mieExtinct() * depthM;
    const scatter = mieScatter();
    for (let channel = 0; channel < 3; channel += 1) {
      const viewTransmit = Math.exp(
        -(AIR_LAW.rayleighScatter[channel] * depthR
          + mieTotal
          + AIR_LAW.ozoneAbsorb[channel] * depthO),
      );
      // Aimed light, straight from the sun, keeps its phase function; light
      // that has already bounced has lost its direction and arrives evenly.
      const aimed = AIR_LAW.rayleighScatter[channel] * rayleigh * phaseR
        + scatter * mie * phaseM;
      const even = AIR_LAW.rayleighScatter[channel] * rayleigh + scatter * mie;
      out[channel] += viewTransmit
        * (sunTransmit[channel] * aimed + bounced[channel] * even)
        * span;
    }
  }

  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] *= AIR_LAW.solarIrradiance;
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the ground receives. Two answers, and they are not interchangeable:
// the beam is a direction with a colour, the fill is the whole dome at once.
// ---------------------------------------------------------------------------

export interface Illumination {
  /** Normalised so the strongest channel is 1 — this is a light's `color`. */
  readonly colour: readonly [number, number, number];
  /** Magnitude of that strongest channel — this is a light's `intensity`. */
  readonly level: number;
}

const BLACK: Illumination = { colour: [1, 1, 1], level: 0 };

function split(rgb: readonly [number, number, number]): Illumination {
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (peak <= 1e-6) return BLACK;
  return { colour: [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak], level: peak };
}

/**
 * The direct beam at ground level.
 *
 * There is no authored "warm sunset colour" anywhere: the beam is white light
 * that has lost what the air took, so it reddens because a low sun is seen
 * through thirty-eight times as much air as a high one. It also nearly stops —
 * at the horizon only 7% of the red and 0.6% of the green survive, which is
 * why a sunset frame is lit by the SKY and the land reads as a silhouette. A
 * key light that stays strong to the last moment is the single loudest tell
 * that a world's dusk was drawn rather than computed.
 */
export function sunBeam(sunElevationSin: number): Illumination {
  const beam = transmittanceAt(0, sunElevationSin);
  return split(beam);
}

/**
 * Cosine-weighted irradiance from the whole dome onto flat ground: the fill.
 *
 * This is what keeps a dusk frame readable after the beam has died, and it is
 * why the fill must not be a hand-tuned pair of day/night constants — at the
 * moment the sun touches the horizon the sky is doing ALL of the lighting, and
 * it is orange on one side and blue on the other.
 */
export function skyFill(sun: Direction, rings = 4, spokes = 8): Illumination {
  const total: [number, number, number] = [0, 0, 0];
  const sample: [number, number, number] = [0, 0, 0];
  let weight = 0;
  for (let ring = 0; ring < rings; ring += 1) {
    // Equal-area in sin(elevation) — the cosine weight is then just the ring.
    const sinElevation = (ring + 0.5) / rings;
    const cosElevation = Math.sqrt(Math.max(0, 1 - sinElevation * sinElevation));
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const azimuth = ((spoke + 0.5) / spokes) * Math.PI * 2;
      skyRadiance(
        [
          Math.cos(azimuth) * cosElevation,
          sinElevation,
          Math.sin(azimuth) * cosElevation,
        ],
        sun,
        2,
        sample,
      );
      for (let channel = 0; channel < 3; channel += 1) {
        total[channel] += sample[channel] * sinElevation;
      }
      weight += sinElevation;
    }
  }
  for (let channel = 0; channel < 3; channel += 1) {
    total[channel] /= Math.max(weight, 1e-6);
  }
  return split(total);
}

/**
 * The air a distant object is seen through, looking along the horizon at a
 * given bearing from the sun. This is the scene fog's colour and the colour
 * the world edge dissolves into — they are the sky, not a painted grey.
 */
export function horizonColour(
  sun: Direction,
  bearingFromSun: number,
  elevationDegrees = 1.5,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  // Rebuild a view direction at that bearing around the sun's own azimuth.
  const flat = Math.hypot(sun[0], sun[2]) || 1e-6;
  const sunX = sun[0] / flat;
  const sunZ = sun[2] / flat;
  const cos = Math.cos(bearingFromSun);
  const sin = Math.sin(bearingFromSun);
  const elevation = (elevationDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation);
  return skyRadiance(
    [
      (sunX * cos - sunZ * sin) * horizontal,
      Math.sin(elevation),
      (sunX * sin + sunZ * cos) * horizontal,
    ],
    sun,
    2,
    out,
  );
}

/** Solar elevation in degrees from the sine the renderer carries around. */
export const elevationDegrees = (sinElevation: number): number =>
  (Math.asin(Math.max(-1, Math.min(1, sinElevation))) * 180) / Math.PI;

/**
 * How much of the night lighting is due: street lamps, window glow, the moon.
 * Tied to civil twilight rather than to the old `1 - day`, which had the lamps
 * at full strength while the sun was still visibly above the horizon.
 */
export function nightLevel(sinElevation: number): number {
  const degrees = elevationDegrees(sinElevation);
  const t = (degrees - 1) / (AIR_LAW.twilightFloor - 1);
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}
