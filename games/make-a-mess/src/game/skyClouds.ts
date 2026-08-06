import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
} from "three";
import type { Material, Texture } from "three";
import {
  CLOUD_LAW,
  extinctionLength,
  SKY_FIELD_SIZE,
  cloudEdgeFor,
  cloudReach,
  getSkyFieldData,
  type SkyWeather,
} from "./skyWeatherModel.ts";
import {
  AIR_LAW,
  MULTI_SCATTER_SIZE,
  TRANSMITTANCE_HEIGHT,
  TRANSMITTANCE_WIDTH,
  multiScatterTable,
  transmittanceTable,
} from "./atmosphereModel.ts";

let fieldTexture: DataTexture | null = null;

function getSkyFieldTexture(): DataTexture {
  if (!fieldTexture) {
    const texture = new DataTexture(
      getSkyFieldData(),
      SKY_FIELD_SIZE,
      SKY_FIELD_SIZE,
      RGBAFormat,
      UnsignedByteType,
    );
    texture.name = "sky:weather-field";
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    // The march picks its own level from its step length, so these mips are
    // read deliberately rather than guessed at from screen derivatives.
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    fieldTexture = texture;
  }
  return fieldTexture;
}

/** Half the sun's angular diameter, in degrees. */
const SUN_ANGULAR_RADIUS_DEGREES = 0.2666;

/**
 * Honest A/B for the live quality axis. When false, the dome always marches
 * at author maximum (gpuQuality 2) regardless of the governor — isolate sky
 * cost without disabling the physical air itself.
 */
export const SKY_MARCH_QUALITY_ENABLED = true;

/** A GLSL float literal — an integer written bare would be an int there. */
function f(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/** Interleaved gradient noise — same grain the cloud march uses for phase. */
const SKY_PHASE_DITHER = /* glsl */ `
  float skyPhaseDither() {
    return fract(52.9829189
      * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  }
`;

// ---------------------------------------------------------------------------
// The air, on the GPU.
//
// Same law as `atmosphereModel`, same two tables, generated from the same
// constants — the CPU answers "what colour is the key light, the fill and the
// fog", the GPU answers "what colour is the sky in this direction", and there
// is no third place where either could be tuned apart from the other.
//
// EVERYTHING HERE IS IN MEGAMETRES. A planet radius of 6 360 000 squares to
// 4e13, and a float32 holds seven digits: the discriminant of the ray-sphere
// test would be quantised to steps of four million metres, which is not a
// horizon at all. At 6.36 the same arithmetic is exact to a millimetre.
// ---------------------------------------------------------------------------
const MM = 1e6;
/** Metres of air per megametre — turns the law's SI constants into Mm units. */
const perMm = (value: number) => value * MM;

const airShaderFunctions = /* glsl */ `
  uniform sampler2D uAirTransmittance;
  uniform sampler2D uAirMultiScatter;
  uniform float uAirHaze;
  uniform float uSunDiscRadiance;
  uniform float uSunAureoleGain;

  const float AIR_PLANET = ${f(AIR_LAW.planetRadius / MM)};
  const float AIR_TOP = ${f(AIR_LAW.atmosphereRadius / MM)};
  const float AIR_DEPTH = ${f((AIR_LAW.atmosphereRadius - AIR_LAW.planetRadius) / MM)};
  const float AIR_MU_FLOOR = ${f(-0.35)};
  const vec3 AIR_BETA_R = vec3(
    ${f(perMm(AIR_LAW.rayleighScatter[0]))},
    ${f(perMm(AIR_LAW.rayleighScatter[1]))},
    ${f(perMm(AIR_LAW.rayleighScatter[2]))}
  );
  const vec3 AIR_BETA_O = vec3(
    ${f(perMm(AIR_LAW.ozoneAbsorb[0]))},
    ${f(perMm(AIR_LAW.ozoneAbsorb[1]))},
    ${f(perMm(AIR_LAW.ozoneAbsorb[2]))}
  );
  const float AIR_MIE_S = ${f(perMm(AIR_LAW.mieScatter))};
  const float AIR_MIE_E = ${f(perMm(AIR_LAW.mieScatter + AIR_LAW.mieAbsorb))};
  const float AIR_H_R = ${f(AIR_LAW.rayleighHeight / MM)};
  const float AIR_H_M = ${f(AIR_LAW.mieHeight / MM)};
  const float AIR_OZONE_C = ${f(AIR_LAW.ozoneCentre / MM)};
  const float AIR_OZONE_W = ${f(AIR_LAW.ozoneWidth / MM)};
  const float AIR_G = ${f(AIR_LAW.mieG)};
  const float AIR_IRRADIANCE = ${f(AIR_LAW.solarIrradiance)};

  /** Rayleigh, Mie and ozone density at a height, relative to sea level. */
  vec3 airDensityAt(float height) {
    return vec3(
      exp(-height / AIR_H_R),
      exp(-height / AIR_H_M),
      max(0.0, 1.0 - abs(height - AIR_OZONE_C) / AIR_OZONE_W)
    );
  }

  /**
   * Where a (height, sun cosine) pair lands in either table. Height is square
   * rooted so half the rows sit in the lowest quarter of the air, which is
   * where all the density is; the cosine is linear because the table is wide.
   */
  vec2 airTableUv(float height, float mu) {
    return vec2(
      (mu - AIR_MU_FLOOR) / (1.0 - AIR_MU_FLOOR),
      sqrt(clamp(height, 0.0, AIR_DEPTH) / AIR_DEPTH)
    );
  }

  /** Fraction of each colour that survives the trip out to space. */
  vec3 airTransmittance(float height, float mu) {
    return texture2D(uAirTransmittance, airTableUv(height, mu)).rgb;
  }

  /** Light that has already bounced, and so arrives from every direction. */
  vec3 airMultiScatter(float height, float mu) {
    return texture2D(uAirMultiScatter, airTableUv(height, mu)).rgb;
  }

  /** Air a ray crosses before it leaves the atmosphere, or hits the ground. */
  float airPathLength(float radius, float mu) {
    float base = radius * radius * (mu * mu - 1.0);
    float ground = base + AIR_PLANET * AIR_PLANET;
    if (mu < 0.0 && ground >= 0.0) {
      return max(0.0, -radius * mu - sqrt(ground));
    }
    float top = base + AIR_TOP * AIR_TOP;
    if (top < 0.0) return 0.0;
    return max(0.0, -radius * mu + sqrt(top));
  }

  float airRayleighPhase(float cosAngle) {
    return 0.05968310365946075 * (1.0 + cosAngle * cosAngle);
  }

  float airMiePhase(float cosAngle) {
    float g2 = AIR_G * AIR_G;
    return 0.1193662073189215
      * ((1.0 - g2) * (1.0 + cosAngle * cosAngle))
      / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * AIR_G * cosAngle, 1.5));
  }

  /**
   * The sky in one direction. Samples are spaced quadratically: a grazing view
   * crosses hundreds of kilometres of air and nearly all of the scattering
   * happens in the first few, so an even march spends its whole budget on
   * empty high air and aliases the part that is actually bright.
   *
   * The step count is a descent from AIR_LAW.viewSteps: gpuQuality picks a
   * ceiling, elevation scales it (zenith cheaper, horizon full), and bake
   * forces the coarse ceiling. Phase dither is what makes fewer steps safe
   * — without it, every ray sampling at the same phase draws contour bands.
   *
   * The sun may be below the horizon. That is not a special case — the table
   * returns zero for any sample the planet stands in front of, which IS the
   * Earth's shadow, while samples above it are still lit by a reddened beam.
   * Twilight is nowhere authored here; it is what the geometry does.
   */
  vec3 airRadiance(vec3 dir, vec3 sunDir, float eyeHeight) {
    float radius = AIR_PLANET + clamp(eyeHeight, 0.0, AIR_DEPTH);
    // The GEOMETRY is mirrored about the horizon while the phase angle below
    // keeps the true direction. A downward ray from two metres up hits the
    // ground immediately, so an honest path there is zero and the lower half
    // of the dome would render black — visible as a hard band wherever the
    // world edge's fog sea does not quite reach. Mirrored, it simply carries
    // the horizon's own colour downward, which is what haze over water does.
    float mu = max(dir.y, 0.0);
    float path = airPathLength(radius, mu);
    if (path <= 0.0) return vec3(0.0);

    float cosSun = dot(dir, sunDir);
    float phaseR = airRayleighPhase(cosSun);
    float phaseM = airMiePhase(cosSun);
    float mieScatter = AIR_MIE_S * uAirHaze;
    float mieExtinct = AIR_MIE_E * uAirHaze;
    // Quality ceilings 0 / 1 / 2 from AIR_LAW.qualityViewSteps.
    float q0 = ${f(AIR_LAW.qualityViewSteps[0])};
    float q1 = ${f(AIR_LAW.qualityViewSteps[1])};
    float q2 = ${f(AIR_LAW.qualityViewSteps[2])};
    float qualityCeiling = mix(
      mix(q0, q1, clamp(uSkyQuality, 0.0, 1.0)),
      q2,
      clamp(uSkyQuality - 1.0, 0.0, 1.0)
    );
    float steps = mix(qualityCeiling, ${f(AIR_LAW.coarseViewSteps)}, uCloudCoarse);
    // Zenith spends less of the ceiling; the horizon keeps it for twilight.
    steps = max(
      ${f(AIR_LAW.coarseViewSteps)},
      steps * mix(1.0, ${f(AIR_LAW.zenithStepScale)}, clamp(dir.y, 0.0, 1.0))
    );
    // Same grain as the cloud march: fewer steps without horizontal bands.
    float dither = skyPhaseDither();

    vec3 depth = vec3(0.0);
    vec3 total = vec3(0.0);
    float previous = 0.0;
    for (int step = 0; step < ${AIR_LAW.viewSteps}; step += 1) {
      if (float(step) >= steps) break;
      float reach = (float(step) + dither) / steps;
      float far = path * reach * reach;
      float span = max(far - previous, 0.0);
      float t = (previous + far) * 0.5;
      previous = far;
      if (span <= 0.0) continue;

      float sampleRadius = sqrt(radius * radius + t * t + 2.0 * radius * t * mu);
      float height = sampleRadius - AIR_PLANET;
      vec3 local = airDensityAt(height);
      depth += local * span;

      // The sun's cosine at THIS sample, not at the eye: along a ray hundreds
      // of kilometres long the local vertical turns, which is how the far end
      // can still be in sunlight while the near end is already in shadow.
      float muSun = (radius * sunDir.y + t * cosSun) / sampleRadius;
      vec3 sunlight = airTransmittance(height, muSun);
      vec3 bounced = airMultiScatter(height, muSun);

      vec3 seen = exp(-(
        AIR_BETA_R * depth.x + mieExtinct * depth.y + AIR_BETA_O * depth.z
      ));
      // Light straight from the sun keeps its phase function; light that has
      // already bounced has lost its direction and arrives evenly.
      vec3 aimed = AIR_BETA_R * (local.x * phaseR) + mieScatter * local.y * phaseM;
      vec3 even = AIR_BETA_R * local.x + mieScatter * local.y;
      total += seen * (sunlight * aimed + bounced * even) * span;
    }
    return total * AIR_IRRADIANCE;
  }
`;

const [warpA, warpB, warpC, warpD] = CLOUD_LAW.fieldWarp;
const warpScale = CLOUD_LAW.fieldWarpScale;
/**
 * The second tap covers a wider domain, so one of its texels spans more world
 * than one of the primary's. Reading both at the same level would filter the
 * large-scale structure away first, which is the opposite of what is wanted.
 */
const WARP_LOD_BIAS = -Math.log2(
  warpScale * Math.sqrt(Math.abs(warpA * warpD - warpB * warpC)),
);

const skyShaderFunctions = /* glsl */ `
  uniform sampler2D uCloudMap;
  uniform vec2 uCloudDrift;
  uniform vec2 uMidDrift;
  uniform vec2 uCirrusDrift;
  uniform vec2 uCloudShear;
  uniform vec2 uSunLimb;
  uniform vec2 uSunAureole;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uCloudCoverage;
  uniform float uCloudEdge;
  uniform float uCloudBase;
  uniform float uCloudThickness;
  uniform float uCloudScale;
  uniform float uCloudDensity;
  uniform float uCloudHazeRate;
  uniform float uCloudReach;
  uniform float uCloudCoarse;
  // Live quality 0 / 1 / 2 from the governor. Bake forces coarse via
  // uCloudCoarse. Kill-switch freezes this at 2.
  uniform float uSkyQuality;
  uniform float uMidLevel;
  uniform float uMidBase;
  uniform float uMidScale;
  uniform float uCirrus;
  uniform float uCirrusBase;
  uniform float uCirrusScale;
  uniform float uBeamStrength;
  uniform float uSunRadiusDegrees;

  ${SKY_PHASE_DITHER.trim()}

  // ---- solar geometry -------------------------------------------------
  // Bennett's formula: refraction in arcminutes for an APPARENT altitude in
  // degrees. Every ray is refracted, not just the one that finds the sun, so
  // this is applied to the view direction and the sun stays geometric.
  float atmosphericRefraction(float apparentAltitudeDegrees) {
    float altitude = max(apparentAltitudeDegrees, -1.2);
    return 1.0 / tan(radians(altitude + 7.31 / (altitude + 4.4)));
  }

  // ---- weather field --------------------------------------------------
  // Mirrors sampleCloudField in skyWeatherModel EXACTLY, and every constant
  // below comes from CLOUD_LAW rather than being written twice: the shadow
  // that crosses the polder and the cloud that casts it have to be the same
  // shape, and they stopped being it the moment one side grew a term the
  // other did not have.
  //
  // The wide tap is a rotated copy of the map over a 3.6x wider domain, so one
  // tile never reads as a repeat across an open sky. It is the only lookup the
  // combined tap below cannot supply.
  float cloudWideTap(vec2 world, float lod) {
    vec2 uv = world / uCloudScale;
    vec2 wide = vec2(
      uv.x * ${f(warpA)} + uv.y * ${f(warpB)},
      uv.x * ${f(warpC)} + uv.y * ${f(warpD)}
    ) * ${f(warpScale)};
    return textureLod(uCloudMap, wide, max(lod - ${f(WARP_LOD_BIAS)}, 0.0)).r;
  }

  /** The whole silhouette, for things that only want the deck's plan shape. */
  float cloudField(vec2 world, float lod) {
    return textureLod(uCloudMap, world / uCloudScale, lod).r
        * ${f(CLOUD_LAW.fieldPrimary)}
      + cloudWideTap(world, lod) * ${f(CLOUD_LAW.fieldSecondary)};
  }

  /**
   * Water at a world point, and how far up its own column that point sits.
   *
   * The height is not decoration. Reading a flat map and extruding it upward
   * gave every cloud in the sky the same base AND the same top, and made the
   * silhouette from below identical to the silhouette from the side: a stamp,
   * not a heap. Here the column has its own depth, its own flat base, a
   * silhouette that shrinks with height into a dome, a top that frays, and a
   * lean downwind that keeps one height from being a copy of another.
   *
   * TWO lookups, not four. The lean is applied by height, before anything is
   * read, so shape (r), billow (g) and the column's own depth (a) all come out
   * of the same leaning texel — and the lean is itself what carries the billow
   * across a column, so it needs no offset of its own. Only the wide tap sits
   * somewhere else.
   */
  vec3 cloudSample(vec3 p, float lod) {
    float height = (p.y - uCloudBase) / uCloudThickness;
    if (height < 0.0 || height > 1.0) return vec3(0.0);
    vec2 leaned = p.xz - uCloudDrift + uCloudShear * height;
    vec4 tap = textureLod(uCloudMap, leaned / uCloudScale, lod);
    float rise = ${f(CLOUD_LAW.topFloor)} + ${f(1 - CLOUD_LAW.topFloor)} * tap.a;
    float climb = height / rise;
    if (climb >= 1.0) return vec3(0.0);
    // Metres of this heap standing over the point. Free here, and the whole
    // reason the heap has a lit top and a dark belly further down.
    float above = (rise - height) * uCloudThickness;
    float field = tap.r * ${f(CLOUD_LAW.fieldPrimary)}
      + cloudWideTap(leaned, lod) * ${f(CLOUD_LAW.fieldSecondary)};
    float over = field - uCloudEdge - ${f(CLOUD_LAW.shoulder)} * climb * climb;
    if (over <= 0.0) return vec3(0.0, climb, above);
    float body = smoothstep(0.0, ${f(CLOUD_LAW.edgeSoftness)}, over)
      * (${f(CLOUD_LAW.coreFloor)} + ${f(CLOUD_LAW.coreGain)} * over)
      * smoothstep(0.0, ${f(CLOUD_LAW.baseRamp)}, climb)
      * (1.0 - smoothstep(${f(CLOUD_LAW.topFade)}, 1.0, climb));
    float bite = ${f(CLOUD_LAW.erosion)}
      * smoothstep(${f(CLOUD_LAW.erosionOnset)}, 1.0, climb) * tap.g;
    return vec3(max(body * (1.0 - bite), 0.0), climb, above);
  }

  /**
   * Optical depth from a point toward the sun, in two parts.
   *
   * Its own column above it, analytically — that costs nothing, because the
   * sample already knows how much heap stands over the point, and it is the
   * term that gives a cloud form. Shading that follows only local density
   * makes a dense patch at a cloud's top exactly as dark as one at its base,
   * which is a stain, not a heap.
   *
   * Then ONE look for whatever other heap stands between here and the sun.
   * Aimed to stay under the top of the deck, so it does not sample clear air
   * above the layer and report the sky as unlit.
   */
  float cloudSunDepth(vec3 p, vec3 cloud, vec3 sunDir, float lod) {
    float slant = 1.0 / max(sunDir.y, ${f(CLOUD_LAW.sunSlantFloor)});
    float own = cloud.x * cloud.z * slant * ${f(CLOUD_LAW.ownShadow)};
    float reach = min((uCloudBase + uCloudThickness - p.y) * slant,
      uCloudThickness * 2.2);
    // Light diffusing sideways inside the cloud makes the shadow one heap
    // throws on another softer than its silhouette, so read it a level down.
    float neighbour = cloudSample(p + sunDir * (reach * 0.5), lod + 1.0).x
      * reach * ${f(CLOUD_LAW.neighbourShadow)};
    return (own + neighbour) * uCloudDensity;
  }

  // A dual lobe is why the same cloud is a silver rim from one side and a
  // flat white lump from the other: strong forward scattering plus a weak
  // back lobe so the far side never goes dead. The spread argument flattens
  // both toward isotropic for light that has already bounced.
  float cloudPhase(float cosAngle, float spread) {
    return (
      hgPhase(cosAngle, ${f(CLOUD_LAW.phaseForward)} * spread) * ${f(CLOUD_LAW.phaseMix)}
      + hgPhase(cosAngle, ${f(CLOUD_LAW.phaseBack)} * spread)
        * ${f(1 - CLOUD_LAW.phaseMix)}
    ) * ${f(4 * Math.PI)};
  }

  /**
   * Sunlight reaching this point, in octaves of multiple scattering. Each
   * successive bounce is fainter, less attenuated and less aimed.
   *
   * Neither half of this can be dropped. Beer alone leaves the middle of a
   * cloud black. One raw phase function alone swings the sky fifty-fold
   * between towards the sun and away from it, so everything off-axis reads as
   * a grey stain — which is what the whole deck used to be.
   */
  float cloudSunEnergy(float sunDepth, float cosSun) {
    float weight = 1.0;
    float extinction = 1.0;
    float spread = 1.0;
    float energy = 0.0;
    for (int octave = 0; octave < ${CLOUD_LAW.scatterOctaves}; octave += 1) {
      energy += weight * exp(-sunDepth * extinction) * cloudPhase(cosSun, spread);
      weight *= ${f(CLOUD_LAW.scatterFalloff)};
      extinction *= ${f(CLOUD_LAW.scatterTransmit)};
      spread *= ${f(CLOUD_LAW.scatterSpread)};
    }
    return min(energy, ${f(CLOUD_LAW.scatterCeiling)});
  }

  vec4 marchCumulus(vec3 origin, vec3 dir, vec3 sunDir, float cosSun, vec3 airColor) {
    if (uCloudCoverage <= 0.0 || dir.y < 0.006) return vec4(0.0);
    float baseT = (uCloudBase - origin.y) / dir.y;
    if (baseT <= 0.0) return vec4(0.0);
    float through = min(uCloudThickness / dir.y, uCloudReach);
    // Steps follow the path length instead of being a constant. Six of them
    // over a path that varies ninefold put more than a kilometre of deck
    // between samples near the horizon, against heaps a hundred metres
    // across: that undersampling is what read as horizontal ribbons.
    float count = clamp(
      floor(through / (uCloudScale * ${f(CLOUD_LAW.stepSpan)})),
      ${f(CLOUD_LAW.minSteps)},
      ${f(CLOUD_LAW.maxSteps)}
    );
    // Quality: 0 → coarseSteps (as bake), 1 → not below 8 and ~half the
    // path count, 2 → full path-length count. Bake still forces coarse.
    float q0 = ${f(CLOUD_LAW.coarseSteps)};
    float q1 = max(8.0, count * 0.55);
    float q2 = count;
    float liveCount = mix(
      mix(q0, q1, clamp(uSkyQuality, 0.0, 1.0)),
      q2,
      clamp(uSkyQuality - 1.0, 0.0, 1.0)
    );
    count = mix(liveCount, ${f(CLOUD_LAW.coarseSteps)}, uCloudCoarse);
    float stepLength = through / count;
    // Whatever a step is too coarse to resolve is FILTERED away rather than
    // aliased: the level read is the one whose texel is as wide as the step.
    float lod = clamp(
      log2(stepLength * ${f(SKY_FIELD_SIZE)} / uCloudScale),
      0.0,
      ${f(CLOUD_LAW.maxLod)}
    );
    // Every ray sampling at the same phase draws the sky in contour lines: a
    // heap gains or loses a whole sample as the elevation crosses a threshold,
    // and with two dozen samples that is a tenth of its brightness stepping at
    // once, in a horizontal band. Interleaved gradient noise scatters the
    // phase across the screen instead, which the eye reads as grain.
    float dither = skyPhaseDither();
    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);
    for (int step = 0; step < ${CLOUD_LAW.maxSteps}; step += 1) {
      if (float(step) >= count
        || transmittance < ${f(CLOUD_LAW.exitTransmittance)}) break;
      float t = baseT + stepLength * (float(step) + dither);
      vec3 p = origin + dir * t;
      vec3 cloud = cloudSample(p, lod);
      float density = cloud.x * uCloudDensity;
      if (density <= 0.0) continue;
      float sunDepth = cloudSunDepth(p, cloud, sunDir, lod);
      float energy = cloudSunEnergy(sunDepth, cosSun);
      // Powder: seen from the lit side, a thin fringe is darker than Beer's
      // law says, because forward scattering carries the light on inwards.
      // It darkens the FRINGE. Multiplying the whole sunlit term by it, as
      // this once did, capped every cloud in the sky at 0.385 of full light.
      float powder = 1.0
        - ${f(CLOUD_LAW.powder)} * clamp(-cosSun, 0.0, 1.0) * exp(-sunDepth * 3.0);
      vec3 sunlit = uCloudLit * (energy * ${f(CLOUD_LAW.sunGain)} * powder);
      // Sky above and wet polder below fill the rest, by height within this
      // column — and darkened by the same column, because sky light falls from
      // above and the belly of a heap sees hardly any of it. Without that a
      // cloud glows evenly from inside and the sun is the only thing modelling
      // it, which is a flat shape lit from one side.
      float overhead = exp(-cloud.x * cloud.z * uCloudDensity);
      vec3 filled = uCloudShade
        * mix(${f(CLOUD_LAW.fillBase)}, ${f(CLOUD_LAW.fillTop)}, cloud.y)
        * (${f(1 - CLOUD_LAW.ambientOcclusion)}
          + ${f(CLOUD_LAW.ambientOcclusion)} * overhead);
      // Aerial perspective per sample, not per cloud: a raft that runs from
      // two kilometres out to twenty fades along its own length, which is
      // also what keeps the horizon from ending in a hard slab edge.
      vec3 lit = mix(sunlit + filled, airColor, 1.0 - exp(-t * uCloudHazeRate));
      float extinct = exp(-density * stepLength);
      scattered += transmittance * (1.0 - extinct) * lit;
      transmittance *= extinct;
    }
    return vec4(scattered, 1.0 - transmittance);
  }

  /**
   * A flat sheet far above the deck. Cirrus is ice and scatters hard forward,
   * so it lights up when the sun is behind it and is nearly invisible when it
   * is not; the mid-level sheet is water, and is mottled light and dark
   * instead of glowing.
   */
  vec4 highSheet(
    vec3 origin, vec3 dir, vec4 channel, vec2 stretch, vec2 sheetDrift,
    float altitude, float scale, float amount, float threshold,
    float glow, float shade, float cosSun, vec3 airColor
  ) {
    if (amount <= 0.0 || dir.y < 0.012) return vec4(0.0);
    float t = (altitude - origin.y) / dir.y;
    if (t <= 0.0) return vec4(0.0);
    vec2 uv = (origin.xz + dir.xz * t - sheetDrift) / scale;
    // The same prefiltering the deck gets: a sheet seen edge-on covers more
    // world per pixel the further out it is read.
    float lod = clamp(log2(max(t / altitude, 1.0)) + 1.0, 1.0, 6.0);
    float veil = dot(textureLod(uCloudMap, uv * stretch, lod), channel);
    float form = smoothstep(threshold, threshold + 0.34, veil);
    vec3 colour = mix(
      uCloudLit * (1.0 + glow * smoothstep(0.72, 0.999, cosSun)),
      uCloudShade,
      shade * (1.0 - form)
    );
    return vec4(
      mix(colour, airColor, 1.0 - exp(-t * uCloudHazeRate)),
      form * amount
    );
  }

  /**
   * Crepuscular rays. The air under the deck scatters sunlight toward the eye
   * wherever the deck is not in the way, so the beams are the gaps between
   * the heaps, projected along the sun. Only integrated near the sun, which
   * is also the only direction a beam is ever seen from.
   */
  float cloudBeams(vec3 origin, vec3 dir, vec3 sunDir, float cosSun) {
    // Strength is a uniform the host can zero; quality 0 sheds the 6 field
    // taps entirely so a struggling GPU does not pay for crepuscular hint.
    float aim = smoothstep(0.55, 0.99, cosSun);
    if (
      uCloudCoverage <= 0.0
      || uBeamStrength <= 0.001
      || uSkyQuality < 0.5
      || aim <= 0.001
      || sunDir.y < 0.04
    ) return 0.0;
    float reach = min(uCloudBase * 1.3, 2000.0);
    float lit = 0.0;
    for (int s = 0; s < 6; s += 1) {
      vec3 p = origin + dir * ((float(s) + 0.5) / 6.0 * reach);
      float travel = (uCloudBase + uCloudThickness * 0.3 - p.y) / sunDir.y;
      // The beams are the shape of the deck's base, so they read the base
      // silhouette: no shoulder, no fine octave, and a coarse level.
      float field = cloudField(p.xz + sunDir.xz * travel - uCloudDrift, 2.0);
      lit += 1.0 - smoothstep(
        uCloudEdge,
        uCloudEdge + ${f(CLOUD_LAW.edgeSoftness)},
        field
      );
    }
    return lit / 6.0 * aim;
  }
`;

const sunDiscShader = /* glsl */ `
        // --- the solar disc, seen through the real atmosphere -------------
        // Refracting the RAY and leaving the sun geometric is what puts the
        // disc on the horizon while it is already below it, and squashes it
        // while it sits there: refraction bends the lower limb more than the
        // upper one.
        float rayAltitude = degrees(asin(clamp(dot(up, direction), -1.0, 1.0)));
        float sunAltitude = degrees(asin(clamp(dot(up, vSunDirection), -1.0, 1.0)));
        float rayGeometricAltitude =
          rayAltitude - atmosphericRefraction(rayAltitude) / 60.0;
        vec3 rayFlat = direction - up * dot(up, direction);
        vec3 sunFlat = vSunDirection - up * dot(up, vSunDirection);
        float bearing = degrees(acos(clamp(
          dot(normalize(rayFlat + vec3(1e-6, 0.0, 0.0)),
              normalize(sunFlat + vec3(1e-6, 0.0, 0.0))),
          -1.0, 1.0
        ))) * cos(radians(sunAltitude));
        float discRadius = length(vec2(bearing, rayGeometricAltitude - sunAltitude))
          / uSunRadiusDegrees;

        // Limb darkening: the edge of the photosphere is seen through more of
        // its own atmosphere, so a resolved disc is domed and not a flat cut.
        float limbCosine = sqrt(max(0.0, 1.0 - discRadius * discRadius));
        float limb = 1.0
          - uSunLimb.x * (1.0 - limbCosine)
          - uSunLimb.y * (1.0 - limbCosine * limbCosine);
        // The edge is never a vector circle: scattering blurs it, and the
        // blur grows in the thick air the low sun is seen through.
        float discEdge = mix(0.010, 0.070, clamp(1.0 - rayAltitude / 12.0, 0.0, 1.0));
        float sundisk = (1.0 - smoothstep(1.0 - discEdge, 1.0 + discEdge, discRadius))
          * max(limb, 0.0);
        // Aureole. This is what was missing and the reason the disc read as a
        // sticker: you never see the sun as a clean circle, you see a blown
        // core inside a halo that falls off roughly as the square of the
        // angle and bleeds several degrees into whatever is around it.
        // Two terms — the tight circumsolar glow and the broad wash.
        // NOT a fraction of the disc: the disc is about a million times the
        // brightness of the sky here, so a "small fraction" of it whites out
        // the entire frame. This is absolute radiance, in units of vSunE.
        float sunAureole =
          uSunAureole.x / (1.0 + pow(discRadius / 1.9, 2.2))
          + uSunAureole.y / (1.0 + pow(discRadius / 11.0, 1.9));
`;

const skyComposite = /* glsl */ `
  vec3 skyRayOrigin = cameraPosition;
  vec3 skyRayDirection = normalize(vWorldPosition - cameraPosition);
  float skyCosSun = dot(skyRayDirection, vSunDirection);
  float skyEyeHeight = max(skyRayOrigin.y, 0.0) / ${f(MM)};

  // THE AIR. Everything the analytic sky used to answer with a formula is
  // marched here instead, against the same two tables the CPU reads for the
  // key light, the fill and the fog. That is the whole point: the sky, the
  // light falling on the ground and the colour a cumulus is lit with cannot
  // disagree about what hour it is, because they are one measurement.
  //
  // What the formula could not do, and this can: a warm gradient that is
  // thirty degrees tall instead of five, a zenith that stays blue over an
  // orange horizon because ozone absorbs in the middle of the spectrum, and
  // the Belt of Venus standing on the Earth's own shadow behind the observer.
  vec3 airColor = airRadiance(skyRayDirection, vSunDirection, skyEyeHeight);
  retColor = airColor;

  // The sun itself, reddened by the air it is seen through rather than by an
  // authored dusk tint. At the horizon seven per cent of its red and half a
  // per cent of its green survive — which is why a setting sun can be looked
  // at, and why it is orange without anyone deciding that it should be.
  vec3 skySunBeam = airTransmittance(skyEyeHeight, vSunDirection.y);
  retColor += skySunBeam
    * (sundisk * uSunDiscRadiance + sunAureole * uSunAureoleGain);

  // Far to near: ice veil, then the mid-level sheet, then the deck in front
  // of both of them. Each fades into the air it is seen through — the AIR,
  // deliberately, not the frame with the sun's disc already added into it:
  // a raft four kilometres out must dissolve into sky, never into glare.
  vec4 veil = highSheet(
    skyRayOrigin, skyRayDirection, vec4(0.0, 0.0, 1.0, 0.0), vec2(0.28, 1.0),
    uCirrusDrift, uCirrusBase, uCirrusScale, uCirrus, 0.58, 1.6, 0.0,
    skyCosSun, airColor
  );
  vec4 sheet = highSheet(
    skyRayOrigin, skyRayDirection, vec4(0.0, 1.0, 0.0, 0.0), vec2(1.0, 1.0),
    uMidDrift, uMidBase, uMidScale, uMidLevel, 0.50, 0.25, 0.55,
    skyCosSun, airColor
  );
  vec4 deck = marchCumulus(
    skyRayOrigin, skyRayDirection, vSunDirection, skyCosSun, airColor
  );
  retColor = mix(retColor, veil.rgb, veil.a);
  retColor = mix(retColor, sheet.rgb, sheet.a);
  retColor = mix(retColor, deck.rgb, deck.a);
  // Beams are in the air between the eye and the deck, so they go on last.
  retColor += uCloudLit
    * cloudBeams(skyRayOrigin, skyRayDirection, vSunDirection, skyCosSun)
    * uBeamStrength;
  // No exposure knob rides here any more. The dome leaves this shader in
  // scene-linear radiance because AIR_LAW.solarIrradiance is the ONE anchor
  // between physics and the renderer's units, and it is applied inside the
  // march. A second scale at the end is how the sky and the light on the
  // ground drifted apart in the first place.
  gl_FragColor = vec4( retColor, 1.0 );
`;

export interface SkyCloudUniforms {
  readonly drift: Vector2;
  readonly midDrift: Vector2;
  readonly cirrusDrift: Vector2;
  readonly lit: Color;
  readonly shade: Color;
  setWeather(weather: SkyWeather): void;
  /** Aerosol multiplier for this world's air — see `skyHaze`. */
  setHaze(haze: number): void;
  /**
   * Live march budget 0 / 1 / 2 (governor gpuQuality). Forced to 2 when
   * `SKY_MARCH_QUALITY_ENABLED` is false.
   */
  setMarchQuality(quality: 0 | 1 | 2): void;
}

interface UniformMap {
  [name: string]: { value: unknown };
}

/**
 * The two atmosphere tables, as textures. Half float rather than bytes: the
 * transmittance of the blue channel through a horizontal path is around a
 * millionth, and a byte cannot hold the difference between that and nothing —
 * which is the difference between a sunset and a black band.
 *
 * These are the same numbers `atmosphereModel` answers CPU questions from.
 * They depend on nothing that changes during play, so they are built once per
 * air and then only read.
 */
function airTable(
  values: Float32Array,
  width: number,
  height: number,
  name: string,
): DataTexture {
  const packed = new Uint16Array(width * height * 4);
  for (let texel = 0; texel < width * height; texel += 1) {
    packed[texel * 4] = DataUtils.toHalfFloat(values[texel * 3]);
    packed[texel * 4 + 1] = DataUtils.toHalfFloat(values[texel * 3 + 1]);
    packed[texel * 4 + 2] = DataUtils.toHalfFloat(values[texel * 3 + 2]);
    packed[texel * 4 + 3] = DataUtils.toHalfFloat(1);
  }
  const texture = new DataTexture(
    packed,
    width,
    height,
    RGBAFormat,
    HalfFloatType,
  );
  texture.name = name;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

let transmittanceTexture: DataTexture | null = null;
let multiScatterTexture: DataTexture | null = null;

function getAirTables(): readonly [DataTexture, DataTexture] {
  transmittanceTexture ??= airTable(
    transmittanceTable(),
    TRANSMITTANCE_WIDTH,
    TRANSMITTANCE_HEIGHT,
    "sky:air-transmittance",
  );
  multiScatterTexture ??= airTable(
    multiScatterTable(),
    MULTI_SCATTER_SIZE,
    MULTI_SCATTER_SIZE,
    "sky:air-multi-scatter",
  );
  return [transmittanceTexture, multiScatterTexture];
}

/**
 * Coarse mode, for the PMREM bake. `three-stdlib` hands every `Sky` the same
 * material instance, so the environment capture renders the visible sky's own
 * shader six times per relight — at full march that is six more full-cost
 * skies for an irradiance probe that will be blurred to nothing anyway.
 */
export function setSkyCloudCoarse(material: Material, coarse: boolean): void {
  const uniforms = (material as Material & { uniforms?: UniformMap }).uniforms;
  if (uniforms?.uCloudCoarse) uniforms.uCloudCoarse.value = coarse ? 1 : 0;
}

/**
 * The one shared sky material, remembered at graft time. Service passes that
 * re-render the whole scene mid-frame (the polder water's mirror and
 * refraction) drop the dome to its bake march through this handle: their
 * image of the sky is smeared by ripples or absorbed by the water column, and
 * a full march there is the single most expensive thing in their pixels.
 */
let installedSkyMaterial: Material | null = null;

/** Coarse the shared dome for a service pass; ALWAYS restore in the caller. */
export function setInstalledSkyCloudCoarse(coarse: boolean): void {
  if (installedSkyMaterial) setSkyCloudCoarse(installedSkyMaterial, coarse);
}

/**
 * Live gpuQuality → dome step ceilings. Bake still uses `setSkyCloudCoarse`.
 */
export function setSkyMarchQuality(
  material: Material,
  quality: 0 | 1 | 2,
): void {
  const uniforms = (material as Material & { uniforms?: UniformMap }).uniforms;
  if (!uniforms?.uSkyQuality) return;
  uniforms.uSkyQuality.value = SKY_MARCH_QUALITY_ENABLED ? quality : 2;
}

/**
 * Grafts the weather field and a physical solar disc onto the analytic sky
 * already in use. Worlds that never set a coverage keep the sky they had:
 * every cloud branch leaves at the first test.
 */
export function installSkyClouds(material: Material): SkyCloudUniforms | null {
  if (!("uniforms" in material) || !("fragmentShader" in material)) return null;
  const shaderMaterial = material as Material & {
    uniforms: UniformMap;
    fragmentShader: string;
  };
  installedSkyMaterial = material;
  if (shaderMaterial.uniforms.uCloudMap) return null;

  const drift = new Vector2();
  const midDrift = new Vector2();
  const cirrusDrift = new Vector2();
  const shear = new Vector2();
  const lit = new Color("#ffffff");
  const shade = new Color("#8d97a6");

  const uniforms = shaderMaterial.uniforms;
  uniforms.uCloudMap = { value: getSkyFieldTexture() as Texture };
  uniforms.uCloudDrift = { value: drift };
  uniforms.uMidDrift = { value: midDrift };
  uniforms.uCirrusDrift = { value: cirrusDrift };
  uniforms.uCloudShear = { value: shear };
  uniforms.uCloudLit = { value: lit };
  uniforms.uCloudShade = { value: shade };
  uniforms.uCloudCoverage = { value: 0 };
  uniforms.uCloudEdge = { value: 1 };
  uniforms.uCloudBase = { value: 900 };
  uniforms.uCloudThickness = { value: 900 };
  uniforms.uCloudScale = { value: 5200 };
  uniforms.uCloudDensity = { value: 0.0042 };
  uniforms.uCloudHazeRate = { value: 1 / 13000 };
  uniforms.uCloudReach = { value: 13000 * CLOUD_LAW.reachInHazes };
  uniforms.uCloudCoarse = { value: 0 };
  uniforms.uSkyQuality = { value: 2 };
  uniforms.uMidLevel = { value: 0 };
  uniforms.uMidBase = { value: 4200 };
  uniforms.uMidScale = { value: 5600 };
  uniforms.uCirrus = { value: 0 };
  uniforms.uCirrusBase = { value: 7200 };
  uniforms.uCirrusScale = { value: 9000 };
  uniforms.uBeamStrength = { value: 0 };
  // Solar limb darkening in the visible, quadratic law.
  uniforms.uSunLimb = { value: new Vector2(0.6, 0.07) };
  // Tight circumsolar glow, then the broad wash, in units of vSunE.
  uniforms.uSunAureole = { value: new Vector2(0.035, 0.004) };
  uniforms.uSunRadiusDegrees = { value: SUN_ANGULAR_RADIUS_DEGREES };
  const [transmittance, multiScatter] = getAirTables();
  uniforms.uAirTransmittance = { value: transmittance as Texture };
  uniforms.uAirMultiScatter = { value: multiScatter as Texture };
  uniforms.uAirHaze = { value: 1 };
  // The disc is roughly a hundred thousand times the sky it sits in; this is
  // enough of that to clip white through AgX with room to spare, and to keep
  // clipping once the horizon has taken all but seven per cent of its red.
  uniforms.uSunDiscRadiance = { value: 420 };
  uniforms.uSunAureoleGain = { value: 40 };

  const sunDiscSource =
    "float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );";
  const sunAddSource = "L0 += ( vSunE * 19000.0 * Fex ) * sundisk;";
  const compositeSource = "gl_FragColor = vec4( retColor, 1.0 );";
  for (const source of [sunDiscSource, sunAddSource, compositeSource]) {
    if (!shaderMaterial.fragmentShader.includes(source)) {
      // The upstream sky shader moved. Better a plain sky than a broken one.
      return null;
    }
  }

  // Cloud declarations first: the air march and the deck share uSkyQuality /
  // uCloudCoarse, and one uniform declared twice is a compile error.
  // skyPhaseDither lives with the cloud uniforms so both marches see one grain.
  shaderMaterial.fragmentShader = shaderMaterial.fragmentShader
    .replace(
      "void main() {",
      `${skyShaderFunctions}\n${airShaderFunctions}\n      void main() {`,
    )
    .replace(sunDiscSource, sunDiscShader)
    // The upstream sum is left in place so `sundisk` and `sunAureole` keep a
    // consumer inside the analytic branch; the composite overwrites what it
    // produced, and the compiler drops the rest of that chain as dead.
    .replace(
      sunAddSource,
      "L0 += vSunE * Fex * ( 19000.0 * sundisk + sunAureole );",
    )
    .replace(compositeSource, skyComposite);
  material.needsUpdate = true;

  return {
    drift,
    midDrift,
    cirrusDrift,
    lit,
    shade,
    setWeather(weather: SkyWeather) {
      uniforms.uCloudCoverage.value = weather.coverage;
      uniforms.uCloudEdge.value = cloudEdgeFor(weather.coverage);
      uniforms.uCloudBase.value = weather.baseAltitude;
      uniforms.uCloudThickness.value = weather.thickness;
      uniforms.uCloudScale.value = weather.fieldScale;
      uniforms.uCloudDensity.value = weather.density;
      uniforms.uCloudHazeRate.value = 1 / extinctionLength(weather);
      uniforms.uCloudReach.value = cloudReach(weather);
      shear.set(
        Math.cos(weather.windBearing) * CLOUD_LAW.shear,
        Math.sin(weather.windBearing) * CLOUD_LAW.shear,
      );
      uniforms.uMidLevel.value = weather.midLevel;
      uniforms.uMidBase.value = weather.midAltitude;
      uniforms.uMidScale.value = weather.midScale;
      uniforms.uCirrus.value = weather.cirrus;
      uniforms.uCirrusBase.value = weather.cirrusAltitude;
      uniforms.uCirrusScale.value = weather.cirrusScale;
      uniforms.uBeamStrength.value = weather.beamStrength;
    },
    setHaze(haze: number) {
      uniforms.uAirHaze.value = haze;
    },
    setMarchQuality(quality: 0 | 1 | 2) {
      uniforms.uSkyQuality.value = SKY_MARCH_QUALITY_ENABLED ? quality : 2;
    },
  };
}
