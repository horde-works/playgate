import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
} from "three";
import type { Material, Texture } from "three";
import {
  ATMOSPHERE,
  CLOUD_LAW,
  extinctionLength,
  SKY_FIELD_SIZE,
  cloudEdgeFor,
  cloudReach,
  getSkyFieldData,
  type SkyWeather,
} from "./skyWeatherModel.ts";

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

/** A GLSL float literal — an integer written bare would be an int there. */
function f(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

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
  uniform float uMidLevel;
  uniform float uMidBase;
  uniform float uMidScale;
  uniform float uCirrus;
  uniform float uCirrusBase;
  uniform float uCirrusScale;
  uniform float uBeamStrength;
  uniform float uSunRadiusDegrees;
  uniform float uSkyExposure;

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
    // The environment bake renders this sky six times per relight, and what it
    // wants out of the deck is an average brightness, not a billow.
    count = mix(count, ${f(CLOUD_LAW.coarseSteps)}, uCloudCoarse);
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
    float dither = fract(52.9829189
      * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
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
    float aim = smoothstep(0.55, 0.99, cosSun);
    if (uCloudCoverage <= 0.0 || aim <= 0.001 || sunDir.y < 0.04) return 0.0;
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
  // Far to near: ice veil, then the mid-level sheet, then the deck in front
  // of both of them. Each fades into the air it is seen through, so a sky
  // this deep still ends in haze rather than in an edge.
  vec4 veil = highSheet(
    skyRayOrigin, skyRayDirection, vec4(0.0, 0.0, 1.0, 0.0), vec2(0.28, 1.0),
    uCirrusDrift, uCirrusBase, uCirrusScale, uCirrus, 0.58, 1.6, 0.0,
    skyCosSun, retColor
  );
  vec4 sheet = highSheet(
    skyRayOrigin, skyRayDirection, vec4(0.0, 1.0, 0.0, 0.0), vec2(1.0, 1.0),
    uMidDrift, uMidBase, uMidScale, uMidLevel, 0.50, 0.25, 0.55,
    skyCosSun, retColor
  );
  vec4 deck = marchCumulus(
    skyRayOrigin, skyRayDirection, vSunDirection, skyCosSun, retColor
  );
  retColor = mix(retColor, veil.rgb, veil.a);
  retColor = mix(retColor, sheet.rgb, sheet.a);
  retColor = mix(retColor, deck.rgb, deck.a);
  // Beams are in the air between the eye and the deck, so they go on last.
  retColor += uCloudLit
    * cloudBeams(skyRayOrigin, skyRayDirection, vSunDirection, skyCosSun)
    * uBeamStrength;
  // ONE exposure, applied to everything the dome draws, at the very end: air,
  // cloud, disc, aureole and beams all leave here in the same units, so the
  // ratios this whole file is built on survive it. See ATMOSPHERE — what the
  // Preetham shader emits is display-referred, and the composer reads it as
  // scene-linear radiance before tone mapping it a second time.
  gl_FragColor = vec4( retColor * uSkyExposure, 1.0 );
`;

export interface SkyCloudUniforms {
  readonly drift: Vector2;
  readonly midDrift: Vector2;
  readonly cirrusDrift: Vector2;
  readonly lit: Color;
  readonly shade: Color;
  setWeather(weather: SkyWeather): void;
}

interface UniformMap {
  [name: string]: { value: unknown };
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
  uniforms.uSkyExposure = { value: ATMOSPHERE.exposure };

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

  shaderMaterial.fragmentShader = shaderMaterial.fragmentShader
    .replace("void main() {", `${skyShaderFunctions}\n      void main() {`)
    .replace(sunDiscSource, sunDiscShader)
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
  };
}
