/**
 * One weather field owns the whole sky. The cumulus you see, the shadow that
 * crosses the field, the moment the sun goes behind a cloud and the ambient
 * that dims with it all read the same drifting density map, so none of them
 * can disagree with the others.
 *
 * Pure numbers only: the renderer turns `buildSkyFieldData` into a texture and
 * the same bytes answer CPU questions through `sampleCloudField`.
 *
 * Every number the sky is shaped by lives in `CLOUD_LAW`. The shader does not
 * hold a second copy of any of them — `skyClouds` interpolates them into its
 * GLSL — so the two implementations can drift in structure but never in
 * calibration.
 */

export interface SkyWeather {
  /**
   * Fraction of the deck's own base plane the cumulus claims, looking straight
   * down. 0 leaves the analytic clear sky exactly as it was, which is what
   * every world that has not been authored for weather still gets.
   *
   * This is NOT the fraction of the sky dome you see covered from the ground:
   * a deck a kilometre deep is crossed at a slant by every ray that is not
   * straight up, so the dome always reads fuller than the plan. Use
   * `domeCoverage` to ask what an observer actually sees.
   */
  readonly coverage: number;
  /** Condensation level in metres. Cumulus bases are a plane, not a blob. */
  readonly baseAltitude: number;
  /**
   * Depth of the DEEPEST column in metres, base to top. Every other column is
   * shallower, down to `CLOUD_LAW.topFloor` of this: one deck holds humilis
   * and congestus at the same time, which is what a fair-weather sky is.
   */
  readonly thickness: number;
  /** Metres of world covered by one tile of the field. */
  readonly fieldScale: number;
  /** Extinction per metre inside cloud. */
  readonly density: number;
  /** Drift speed in metres per second. */
  readonly windSpeed: number;
  /** Compass bearing the cloud travels toward, in radians from +x toward +z. */
  readonly windBearing: number;
  /**
   * METEOROLOGICAL VISIBILITY IN METRES — the distance at which contrast falls
   * to 2%, which is what a weather report means by "visibility" and the only
   * number the air's clarity needs. Koschmieder: extinction per metre is
   * 3.912 / visibility, so this ONE value carries both how fast a cloud four
   * kilometres out dissolves and how much air stands between the eye and a
   * building at eighty metres. They were separate numbers, which is how a world
   * ended up with crisp distant cloud and no aerial perspective at all.
   *
   * Real categories, for authoring: 50 km+ exceptionally clear, 20-50 km clear,
   * 10-20 km light haze, 4-10 km haze, 1-4 km mist, under 1 km fog.
   */
  readonly visibility: number;
  /** Strength of the mid-level mottled sheet, 0..1. */
  readonly midLevel: number;
  readonly midAltitude: number;
  readonly midScale: number;
  /** Strength of the high veil, 0..1. */
  readonly cirrus: number;
  readonly cirrusAltitude: number;
  readonly cirrusScale: number;
  /** Brightness of crepuscular rays under the deck. */
  readonly beamStrength: number;
  /** How dark the ground goes under the thickest part of the deck, 0..1. */
  readonly shadowStrength: number;
  /**
   * World-space origin of the cloud field in metres. Offsets the shared noise
   * tile so worlds do not read the same heap layout at the same coordinates.
   */
  readonly fieldOrigin?: readonly [x: number, z: number];
  /**
   * Column lean in metres between base and top. Defaults to `CLOUD_LAW.shear`.
   */
  readonly shear?: number;
}

export const CLEAR_SKY: SkyWeather = {
  coverage: 0,
  baseAltitude: 900,
  thickness: 900,
  fieldScale: 5200,
  density: 0.0042,
  windSpeed: 6,
  windBearing: 0,
  // Haze — 3 km is an ordinary hazy summer day, and it is the WEATHER these
  // islands stand in, not a fog setting. At a genuine 50 km an object eighty
  // metres away has no air in front of it at all: true, and a world with no
  // depth. Here the deck's far rim carries 6% of air, the machine at the end
  // of its route 14%, the world edge 39%.
  visibility: 3000,
  midLevel: 0,
  midAltitude: 4200,
  midScale: 5600,
  cirrus: 0,
  cirrusAltitude: 7200,
  cirrusScale: 9000,
  beamStrength: 0,
  shadowStrength: 0,
};

/**
 * Showers have just gone through: the ground is wet, the air is washed, and
 * fair-weather cumulus with hard flat bases are still building over the
 * polder. A westerly puts them across the island from the sea, with the
 * trailing mid-level sheet of the departed front still overhead.
 */
export const DUTCH_POLDER_SKY: SkyWeather = {
  coverage: 0.27,
  baseAltitude: 680,
  thickness: 1150,
  fieldScale: 5200,
  density: 0.0042,
  windSpeed: 7.5,
  // The same westerly the mills are turned into: mirrors
  // DUTCH_POLDER_WIND_BEARING, which is derived from the island's own compass.
  // Held there by `tests/sky-weather` — a deck that drifts on a bearing of its
  // own is weather from a country the windmills have never heard of, and these
  // two were seventy-one degrees apart.
  windBearing: -1.5742324105259842,
  // Showers wash the air. Long visibility is what lets a heap four kilometres
  // out keep its dark belly instead of dissolving into a pale wash — and it is
  // the same number that leaves the polder's own far bank crisp.
  visibility: 70000,
  midLevel: 0.22,
  midAltitude: 4300,
  midScale: 6100,
  cirrus: 0.16,
  cirrusAltitude: 7400,
  cirrusScale: 9500,
  // Soft crepuscular hint in the dome — not a ground-washing screen veil.
  // Cinematic shafts are scaled separately for this world via sunVeil.
  beamStrength: 0.028,
  shadowStrength: 0.62,
};

/**
 * ПОГОДА ПРИНАДЛЕЖИТ МИРУ.
 *
 * До этой таблицы `CLEAR_SKY` доставался всем, кроме польдера, и нёс две вещи
 * сразу: `coverage: 0` — то есть НИ ОДНОГО облака ни в одном мире, кроме
 * польдера, — и одну на всех дальность видимости 3 км.
 *
 * Три километра — это по метеорологической шкале дымка на грани тумана, и на
 * островах шириной в двести метров она красит не даль, а середину кадра. Замер
 * базальтовой стены (альбедо linear 0.045) на рассвете крепости, через AgX:
 *
 *   дальность       30 м            60 м            120 м
 *    3000 м     #646660 13%     #767a74 19%     #8d928c 28%
 *    9000 м     #51504b  8%     #5b5c57 11%     #6b6e68 15%
 *   20000 м     #4a4844  7%     #504f4a  8%     #595a55 10%
 *
 * Сама стена без воздуха — #44413c, 5%. Аэроперспектива подмешивает не серый, а
 * НЕБО вдоль луча, а небо на горизонте — linear 1.4–2.3, в тридцать пять раз
 * ярче стены. Поэтому восемь процентов воздуха на шестидесяти метрах вчетверо
 * подняли графитовую стену и посадили её в один тон с травой.
 *
 * ЦЕНА ПАЛУБЫ. `coverage > 0` включает марш облаков: до
 * `maxSteps · 2 · (1 + sunSamples)` = 96 выборок на пиксель неба против 16 у
 * чистого воздуха, и `domeNeedsContinuousRepaint` снимает амортизацию купола на
 * нижних ярусах GPU. Это осознанный размен на мир: облака стоят дорого и
 * авторятся там, где они делают кадр, а не везде по умолчанию.
 */
export const WORLD_SKY: Readonly<Record<string, SkyWeather>> = {
  // Летний город: кучевые с плоским основанием, воздух обычный городской.
  // Без mid/cirrus sheets — дальние слои на низком coverage читались как
  // шумовой рудимент между домами, а не как погода.
  "open-house": {
    ...CLEAR_SKY,
    coverage: 0.22,
    baseAltitude: 820,
    thickness: 1000,
    fieldScale: 4800,
    visibility: 24000,
    windSpeed: 6.5,
    windBearing: 0.6,
    beamStrength: 0.02,
    shadowStrength: 0.55,
  },
  // Вулканическая крепость. Единственный мир, которому дымка идёт: здесь она
  // не погода, а то, чем дышит гора. Но 3 км съедали базальт в упор, поэтому
  // воздух отодвинут, а тяжесть неба ушла туда, где ей место, — в палубу.
  // Низкое плотное основание держит горизонт тёмным, и аэроперспектива
  // подмешивает в стену сумрак, а не белизну.
  "basalt-stronghold": {
    ...CLEAR_SKY,
    coverage: 0.58,
    baseAltitude: 540,
    thickness: 1400,
    fieldScale: 3600,
    density: 0.0056,
    visibility: 14000,
    windSpeed: 8,
    windBearing: 2.4,
    fieldOrigin: [1200, -800],
    shear: 180,
    midLevel: 0.3,
    midAltitude: 3200,
    midScale: 4400,
    cirrus: 0,
    beamStrength: 0.05,
    shadowStrength: 0.74,
  },
  // Каллур: сплошная фарерская пасмурность — низкая палуба, дымка съедает
  // дальний план. Канон hero-view (kallur-brief.md §2); числа подбирать
  // замером кадра, а не наугад — см. предупреждение в шапке.
  kallur: {
    ...CLEAR_SKY,
    coverage: 0.74,
    baseAltitude: 390,
    thickness: 680,
    fieldScale: 4200,
    density: 0.0052,
    visibility: 11000,
    windSpeed: 10,
    windBearing: -0.7,
    fieldOrigin: [-900, 600],
    shear: 140,
    midLevel: 0.35,
    midAltitude: 2800,
    midScale: 4800,
    cirrus: 0,
    beamStrength: 0.02,
    shadowStrength: 0.42,
  },
  // Морской фронт над фьордом: рваная низкая облачность, чистый солёный воздух.
  "viking-village": {
    ...CLEAR_SKY,
    coverage: 0.44,
    baseAltitude: 620,
    thickness: 1150,
    fieldScale: 4400,
    density: 0.0046,
    visibility: 30000,
    windSpeed: 9.5,
    windBearing: -0.9,
    fieldOrigin: [-600, 400],
    shear: 220,
    midLevel: 0.24,
    midAltitude: 3600,
    midScale: 5000,
    cirrus: 0.18,
    cirrusAltitude: 6800,
    cirrusScale: 8600,
    beamStrength: 0.04,
    shadowStrength: 0.66,
  },
  // Гранд-терминал: высокое ясное небо с перистой вуалью — под ним читается
  // силуэт дебаркадера, а не погода.
  "grand-terminal": {
    ...CLEAR_SKY,
    coverage: 0.12,
    baseAltitude: 1150,
    thickness: 700,
    fieldScale: 6200,
    density: 0.0038,
    visibility: 40000,
    windSpeed: 5,
    windBearing: 1.9,
    midLevel: 0.08,
    midAltitude: 4800,
    midScale: 6400,
    cirrus: 0.32,
    cirrusAltitude: 8200,
    cirrusScale: 11000,
    beamStrength: 0.015,
    shadowStrength: 0.4,
  },
  // Сухая степь: остров видно целиком, и `fogDistances: [190, 390]` в
  // документе сцены поставлены ровно под это. Воздуху положено соответствовать.
  astana: {
    ...CLEAR_SKY,
    coverage: 0.1,
    baseAltitude: 1400,
    thickness: 800,
    fieldScale: 7800,
    density: 0.0034,
    visibility: 60000,
    windSpeed: 7,
    windBearing: 0.2,
    fieldOrigin: [1400, 900],
    midLevel: 0.06,
    midAltitude: 5200,
    midScale: 7200,
    cirrus: 0.14,
    cirrusAltitude: 9800,
    cirrusScale: 11800,
    beamStrength: 0.012,
    shadowStrength: 0.38,
  },
  nimbus: {
    ...CLEAR_SKY,
    coverage: 0.34,
    baseAltitude: 980,
    thickness: 1300,
    fieldScale: 5400,
    density: 0.0048,
    visibility: 45000,
    windSpeed: 11,
    windBearing: -2.1,
    shear: 320,
    midLevel: 0.2,
    midAltitude: 4600,
    midScale: 6000,
    cirrus: 0.22,
    cirrusAltitude: 7600,
    cirrusScale: 9800,
    beamStrength: 0.03,
    shadowStrength: 0.6,
  },
  // Полигон Tonkawa: наблюдательный мир, небу положено не мешать телеметрии.
  "combat-hexacopter-range": {
    ...CLEAR_SKY,
    coverage: 0.14,
    baseAltitude: 1250,
    thickness: 750,
    fieldScale: 6800,
    density: 0.0036,
    visibility: 45000,
    windSpeed: 4.5,
    windBearing: 1.1,
    midLevel: 0.05,
    midAltitude: 5000,
    midScale: 6600,
    cirrus: 0.08,
    cirrusAltitude: 9000,
    cirrusScale: 10400,
    beamStrength: 0.01,
    shadowStrength: 0.42,
  },
  "dutch-polder": DUTCH_POLDER_SKY,
  "island-airport": {
    ...CLEAR_SKY,
    coverage: 0.2,
    baseAltitude: 1050,
    thickness: 820,
    fieldScale: 6400,
    density: 0.0039,
    visibility: 42000,
    windSpeed: 7.5,
    windBearing: 0.35,
    fieldOrigin: [800, -500],
    midLevel: 0.1,
    midAltitude: 4700,
    midScale: 6200,
    cirrus: 0.22,
    cirrusAltitude: 8500,
    cirrusScale: 10500,
    beamStrength: 0.018,
    shadowStrength: 0.48,
  },
};

/** Воздух мира по его id. Мир без записи стоит под общим ясным небом. */
export function worldWeather(sceneId: string): SkyWeather {
  return WORLD_SKY[sceneId] ?? CLEAR_SKY;
}

/**
 * What is left to author about the air, now that the dome is marched rather
 * than fitted: how much dust is in it, and one multiplier for the fill.
 *
 * There used to be four Preetham parameters per world here, and a fifth
 * number — an exposure — to undo the units that shader emits in. All five are
 * gone. `AIR_LAW` holds the real coefficients of nitrogen, aerosol and ozone,
 * and `AIR_LAW.solarIrradiance` is the single anchor between physics and the
 * renderer, applied inside the march. What a world still gets to say is how
 * dirty its sky is, because that genuinely differs between a polder and a
 * volcano — and it says it once, as a multiplier on the aerosol, instead of as
 * a turbidity that also had to be traded against a rayleigh and a phase g.
 *
 * Aerosol is not a whiter tint. It is forward scattering and it absorbs, so
 * more of it means a brighter halo around the sun, a duller horizon away from
 * it, and a shorter view — all three at once, from one number.
 */
export const ATMOSPHERE = {
  /**
   * Ambient multiplier for the PMREM baked from the dome. The dome is now in
   * scene-linear units of its own, so this is a genuine artistic trim on how
   * much of the sky's light the world receives, not a units fix.
   */
  ambientIntensity: 0.36,
  /** Open country. Every world but the fortress stands under this air. */
  town: { haze: 1 },
  /** Volcanic: the heaviest sky we draw. */
  fortress: { haze: 3.2 },
  /** Cleaner air, for recorded flyovers. */
  cinematic: { haze: 0.45 },
} as const;

/**
 * Koschmieder's constant: contrast falls to 2% after this many e-foldings, so
 * `visibility` in metres becomes the extinction length the shaders integrate
 * over. One conversion, in one place, used by the cloud deck and by the haze
 * on the ground alike — they are the same air.
 */
export const KOSCHMIEDER = 3.912;

/** Metres of air per e-folding of extinction, from the authored visibility. */
export function extinctionLength(weather: SkyWeather): number {
  return weather.visibility / KOSCHMIEDER;
}

/**
 * Fraction of a surface's own colour that survives `distance` metres of this
 * air. What it loses, aerial perspective replaces with the sky in the same
 * direction — which is what the piece materials read out of the environment
 * bake rather than out of an authored fog colour.
 */
export function airTransmittance(weather: SkyWeather, distance: number): number {
  return Math.exp(-distance / extinctionLength(weather));
}

export type SkyTheme = "town" | "fortress";

/**
 * How much aerosol a world's air carries, relative to clean country air.
 *
 * `three-stdlib` hands every `Sky` ONE module-level material, so the visible
 * dome and the sky the environment is baked from are literally the same
 * uniforms. This is the one place the number comes from, for both.
 */
export function skyHaze(theme: SkyTheme, cinematic = false): number {
  if (theme === "fortress") return ATMOSPHERE.fortress.haze;
  return cinematic ? ATMOSPHERE.cinematic.haze : ATMOSPHERE.town.haze;
}

/**
 * A tile has to be wide enough that an open sky is not the same cloud four
 * times, and fine enough that the smallest billow is still several texels.
 * 512 over 5200 m is 10.2 m of world per texel.
 */
export const SKY_FIELD_SIZE = 512;

/**
 * Every constant the deck is shaped and lit by. The shader is generated from
 * this object; there is no second copy to keep in step.
 */
export const CLOUD_LAW = {
  /**
   * Width of the margin where the deck fades in, in field units. This is the
   * SILHOUETTE only: how far a cloud takes to stop being cloud.
   *
   * It cannot also carry how solid the middle is. One smoothstep doing both is
   * what produced first a stencil of flat cut-outs (narrow band: hard edge,
   * uniform interior) and then a smear (wide band: soft edge, nothing solid
   * anywhere). `coreFloor`/`coreGain` carry the solidity separately.
   */
  edgeSoftness: 0.14,

  // ---- the column ------------------------------------------------------
  /**
   * Shallowest column, as a fraction of `thickness`. Without a spread here
   * every cloud in the sky has the same base AND the same top, which is a
   * slab: the silhouette from below and the silhouette from the side become
   * the same stamp and nothing in the frame has vertical form.
   */
  topFloor: 0.26,
  /**
   * How far the threshold climbs between a column's base and its top, in field
   * units. This is what makes a dome instead of a prism: the silhouette has to
   * shrink with height or the cloud is a 2D map extruded upward.
   */
  shoulder: 0.115,
  /** Density at the threshold, and how fast it grows with depth into the field. */
  coreFloor: 0.3,
  coreGain: 3.1,
  /** Fraction of a column's depth the flat base takes to fill in. */
  baseRamp: 0.08,
  /** Where a column starts fraying out, as a fraction of its own depth. */
  topFade: 0.55,
  /** How much the fine octave eats out of the body, at its strongest. */
  erosion: 0.55,
  /** Where that erosion starts biting, as a fraction of a column's depth. */
  erosionOnset: 0.3,
  /**
   * Extra bite on the SILHOUETTE only. Core mass stays; the rim frays so a
   * dense heap does not read as a smooth stamp. Costs no field lookups —
   * it reweights the detail channel and a cell hash of the leaned UV.
   */
  fringeErosion: 0.72,
  /** How far into the heap (`over`, field units) the fringe bite reaches. */
  fringeWidth: 0.11,
  /** Cauliflower cells per field tile on the rim. */
  fringeFrequency: 7.5,
  /**
   * Metres the deck leans downwind between base and top. The wind is faster
   * aloft, so a heap leans — and the lean is also what decorrelates one height
   * of a column from another without paying for a 3D texture, or for a second
   * lookup: shape, billow and depth all come out of the ONE leaning texel.
   */
  shear: 320,

  // ---- the field -------------------------------------------------------
  /** Weight of the primary tap and of the rotated, wider second tap. */
  fieldPrimary: 0.68,
  fieldSecondary: 0.32,
  /** The second tap's rotation, and the factor it is shrunk by. */
  fieldWarp: [-0.29, 0.63, 0.71, 0.41] as const,
  fieldWarpScale: 0.37,

  // ---- the march -------------------------------------------------------
  /**
   * Wanted step, as a fraction of the field scale — about 60 m. A step that
   * does not follow the path length is the whole reason a grazing ray used to
   * cross more than a kilometre of deck per sample and alias the field into
   * horizontal ribbons.
   */
  stepSpan: 0.0092,
  minSteps: 12,
  /**
   * A hard ceiling, not a target. Forty-eight steps closed the aliasing and
   * halved the frame rate; what makes twenty-four safe is the mip below, which
   * filters away exactly what a coarser step can no longer resolve. Steps buy
   * detail, prefiltering buys the absence of ribbons, and only one of the two
   * is paid for per pixel.
   */
  maxSteps: 24,
  /** Steps the environment bake uses: irradiance wants an average, not billows. */
  coarseSteps: 5,
  /** Transmittance at which the rest of a ray can no longer be seen. */
  exitTransmittance: 0.04,
  /**
   * Coarsest mip the march may read. What a step cannot resolve is filtered
   * away rather than aliased, so a step of N metres reads a level whose texel
   * is at least N metres wide. Where this clamp binds, the prefilter stops
   * keeping up and the ripples come back — at 6 it bound at four degrees of
   * elevation, which is squarely inside the frame.
   */
  maxLod: 7,
  /** How far past the haze distance the deck is still walked at all. */
  reachInHazes: 2.6,

  // ---- the light -------------------------------------------------------
  /**
   * Multiple scattering, as octaves. Each successive bounce is fainter, less
   * attenuated and less aimed. A single Beer term leaves a cloud black in the
   * middle; a single raw phase function swings the sky fifty-fold between
   * towards the sun and away from it. Both were true of this sky.
   */
  scatterOctaves: 3,
  scatterFalloff: 0.52,
  scatterTransmit: 0.4,
  scatterSpread: 0.58,
  /** The two lobes of a water droplet's phase function, and their mix. */
  phaseForward: 0.78,
  phaseBack: -0.22,
  phaseMix: 0.66,
  /**
   * Ceiling on the summed energy. Single scattering over-peaks straight down
   * the sun's line — it credits a fringe of no optical depth with the forward
   * lobe of a whole cloud — and unbounded that is a blown white smear around
   * the sun rather than a silver lining.
   */
  scatterCeiling: 5,
  /** Gain on the sunlit term, in the sky shader's own compressed radiance. */
  sunGain: 3,
  /** Shallowest sun the shadow walk will slant for, before it runs to infinity. */
  sunSlantFloor: 0.18,
  /**
   * Weight of a point's OWN column in what shadows it. This is the term that
   * makes volume, and it costs nothing: the march already knows how much heap
   * stands above the point it is at. Without it the shading follows local
   * density instead of depth, so a dense patch at the top of a cloud reads
   * exactly as dark as one at its base and the heap has no form.
   */
  ownShadow: 0.85,
  /** Weight of the one look taken for a heap standing between here and the sun. */
  neighbourShadow: 0.7,
  /**
   * How much of the sky fill the column overhead takes away. Sky light falls
   * from above, so the belly of a heap sees almost none of it; without this a
   * cloud glows uniformly from inside and only the sun models it.
   */
  ambientOcclusion: 0.6,
  /**
   * Powder: seen from the lit side, a thin fringe is darker than Beer's law
   * says, because forward scattering carries the light on inwards. It is a
   * darkening of the fringe, NOT a factor on the whole cloud — multiplying
   * Beer by it capped every cloud in the sky at 0.385 of full brightness.
   */
  powder: 0.62,
  /**
   * Sky-and-ground fill at the base of a column and at its top. The base of a
   * cumulus is its darkest part — a little under the sky behind it — and the
   * top is washed by the whole hemisphere.
   */
  fillBase: 0.28,
  fillTop: 1.05,
} as const;

/**
 * Optical depth from a point to the top of its OWN column, toward the sun.
 * Free at the sample: how much heap stands above a point is already known once
 * the column's depth has been read, and the slant is geometry.
 *
 * This is where a cloud gets its form. The base of a deep congestus carries a
 * kilometre of water over it and goes dark; the top of the same heap carries
 * almost none and burns white; a shallow puff beside it is bright all the way
 * down because there was never anything above it to begin with.
 */
export function cloudSelfShadow(
  weather: SkyWeather,
  density: number,
  metresAbove: number,
  sunElevation: number,
): number {
  const slant = 1 / Math.max(sunElevation, CLOUD_LAW.sunSlantFloor);
  return density * metresAbove * slant * weather.density * CLOUD_LAW.ownShadow;
}

/** Back-compatible alias: the silhouette margin. */
export const CLOUD_EDGE_SOFTNESS = CLOUD_LAW.edgeSoftness;

let cachedField: Uint8Array | null = null;
let cachedQuantiles: Float64Array | null = null;

/** The one weather field. Deterministic, so every consumer sees the same sky. */
export function getSkyFieldData(): Uint8Array {
  cachedField ??= buildSkyFieldData();
  return cachedField;
}

const QUANTILE_STEPS = 256;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Sorted field values, so a requested coverage can be turned into the
 * threshold that actually produces it. Without this, `coverage` is a number
 * that correlates with cloudiness instead of being it: the field is not
 * uniformly distributed, and an author who asks for half a sky gets whatever
 * the noise happens to hand back.
 */
function fieldQuantiles(): Float64Array {
  if (cachedQuantiles) return cachedQuantiles;
  const data = getSkyFieldData();
  const side = 128;
  const samples = new Float64Array(side * side);
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      // The distribution does not depend on the world scale, only on the
      // domain covered, so sample many tiles at unit scale.
      samples[row * side + column] = sampleCloudField(
        data,
        (column / side) * 7.13,
        (row / side) * 7.13,
        1,
      );
    }
  }
  samples.sort();
  const quantiles = new Float64Array(QUANTILE_STEPS + 1);
  for (let step = 0; step <= QUANTILE_STEPS; step += 1) {
    const index = Math.min(
      samples.length - 1,
      Math.round((step / QUANTILE_STEPS) * (samples.length - 1)),
    );
    quantiles[step] = samples[index];
  }
  cachedQuantiles = quantiles;
  return quantiles;
}

/** Threshold that leaves exactly `coverage` of the deck's base above it. */
export function cloudEdgeFor(coverage: number): number {
  if (coverage <= 0) return Number.POSITIVE_INFINITY;
  if (coverage >= 1) return Number.NEGATIVE_INFINITY;
  const quantiles = fieldQuantiles();
  // The transition band straddles the threshold, so the midpoint of the band
  // is what must land on the quantile.
  const position = (1 - coverage) * QUANTILE_STEPS;
  const low = Math.floor(position);
  const high = Math.min(QUANTILE_STEPS, low + 1);
  const blend = position - low;
  const value = quantiles[low] * (1 - blend) + quantiles[high] * blend;
  return value - CLOUD_LAW.edgeSoftness * 0.5;
}

/** The silhouette at the base of the deck: where there is cloud at all, 0..1. */
export function shapeCloudField(field: number, coverage: number): number {
  if (coverage <= 0) return 0;
  return smoothstep(0, CLOUD_LAW.edgeSoftness, field - cloudEdgeFor(coverage));
}

/**
 * How much water there is once inside the silhouette. Grows with depth into
 * the field, so a margin stays translucent while a core goes solid — which is
 * the difference between a cloud and a paper shape.
 */
export function cloudCoreDensity(field: number, coverage: number): number {
  if (coverage <= 0) return 0;
  return (
    CLOUD_LAW.coreFloor
    + CLOUD_LAW.coreGain * Math.max(0, field - cloudEdgeFor(coverage))
  );
}

function hashCell(x: number, y: number, seed: number): number {
  // An integer avalanche, not `sin`: the field is four times the area it was
  // and a trigonometric hash made building it a visible freeze.
  let hash = Math.imul(x | 0, 0x27d4eb2d)
    ^ Math.imul(y | 0, 0x165667b1)
    ^ Math.imul(seed | 0, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function tileableNoise(
  u: number,
  v: number,
  periodU: number,
  periodV: number,
  seed: number,
): number {
  const x = u * periodU;
  const y = v * periodV;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fractionX = x - cellX;
  const fractionY = y - cellY;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightY = fractionY * fractionY * (3 - 2 * fractionY);
  const wrapU = (value: number) => ((value % periodU) + periodU) % periodU;
  const wrapV = (value: number) => ((value % periodV) + periodV) % periodV;
  const x0 = wrapU(cellX);
  const x1 = wrapU(cellX + 1);
  const y0 = wrapV(cellY);
  const y1 = wrapV(cellY + 1);
  const bottom = hashCell(x0, y0, seed) * (1 - weightX)
    + hashCell(x1, y0, seed) * weightX;
  const top = hashCell(x0, y1, seed) * (1 - weightX)
    + hashCell(x1, y1, seed) * weightX;
  return bottom * (1 - weightY) + top * weightY;
}

/**
 * R: the cumulus shape field, four octaves baked into one tap.
 * G: fine detail, the billows that erode a dome into a cauliflower.
 * B: the high veil, stretched hard along the wind.
 * A: vertical development — how deep this column of the deck is. Partly the
 *    shape field itself, because a wide raft really does build higher than a
 *    lone puff, and partly its own noise so the two never lock together.
 */
export function buildSkyFieldData(): Uint8Array {
  const size = SKY_FIELD_SIZE;
  const shapes = new Float32Array(size * size);
  const details = new Float32Array(size * size);
  const veils = new Float32Array(size * size);
  const rises = new Float32Array(size * size);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const u = column / size;
      const v = row / size;
      // Plain layered noise, deliberately. A cluster mask carves the field
      // into detached islands, and detached islands with a hard threshold are
      // exactly what reads as flat cut-outs flying past.
      const index = row * size + column;
      const broad = tileableNoise(u, v, 4, 4, 1);
      shapes[index] = broad * 0.46
        + tileableNoise(u, v, 9, 9, 2) * 0.27
        + tileableNoise(u, v, 20, 20, 3) * 0.17
        + tileableNoise(u, v, 44, 44, 4) * 0.1;
      details[index] = tileableNoise(u, v, 40, 40, 7) * 0.62
        + tileableNoise(u, v, 88, 88, 8) * 0.38;
      // Cirrus is drawn out by the same wind that carries it: long in one
      // axis, tight across it.
      veils[index] = tileableNoise(u, v, 3, 26, 21) * 0.6
        + tileableNoise(u, v, 6, 57, 22) * 0.4;
      rises[index] = tileableNoise(u, v, 2, 2, 31) * 0.4
        + tileableNoise(u, v, 5, 5, 32) * 0.22
        + broad * 0.38;
    }
  }

  // Coverage is a threshold on this field, so the field has to actually span
  // its range. An unnormalised fBm sits in a narrow band around the middle
  // and turns every threshold into a soft grey ramp across the whole sky.
  const data = new Uint8Array(size * size * 4);
  const channels: Array<readonly [Float32Array, number]> = [
    [shapes, 0],
    [details, 1],
    [veils, 2],
    [rises, 3],
  ];
  for (const [values, channel] of channels) {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    const span = Math.max(1e-6, high - low);
    for (let index = 0; index < values.length; index += 1) {
      data[index * 4 + channel] = Math.round(((values[index] - low) / span) * 255);
    }
  }
  return data;
}

function bilinearChannel(
  data: Uint8Array,
  u: number,
  v: number,
  channel: number,
): number {
  const size = SKY_FIELD_SIZE;
  const x = u * size - 0.5;
  const y = v * size - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (value: number) => ((value % size) + size) % size;
  const xa = wrap(x0);
  const xb = wrap(x0 + 1);
  const ya = wrap(y0);
  const yb = wrap(y0 + 1);
  const at = (cx: number, cy: number) => data[(cy * size + cx) * 4 + channel] / 255;
  const bottom = at(xa, ya) * (1 - fx) + at(xb, ya) * fx;
  const top = at(xa, yb) * (1 - fx) + at(xb, yb) * fx;
  return bottom * (1 - fy) + top * fy;
}

/**
 * The raw shape field at a world point, matching `cloudField` in the sky
 * shader: one tap plus a rotated, 3.6x wider tap so a single tile never reads
 * as a repeating pattern across an open sky.
 *
 * Nothing is subtracted here and nothing is subtracted there. The fine octave
 * belongs to `cloudDensityAt`, where it can bite harder near a cloud's top
 * than at its base; folding it into the silhouette put a term in the shader
 * that this function did not have, and the shadow on the polder stopped being
 * the cloud overhead.
 */
export function sampleCloudField(
  data: Uint8Array,
  worldX: number,
  worldZ: number,
  fieldScale: number,
): number {
  const u = worldX / fieldScale;
  const v = worldZ / fieldScale;
  const [a, b, c, d] = CLOUD_LAW.fieldWarp;
  const scale = CLOUD_LAW.fieldWarpScale;
  const warpU = (u * a + v * b) * scale;
  const warpV = (u * c + v * d) * scale;
  return bilinearChannel(data, u, v, 0) * CLOUD_LAW.fieldPrimary
    + bilinearChannel(data, warpU, warpV, 0) * CLOUD_LAW.fieldSecondary;
}

/** Vertical development of this column of the deck, 0..1. */
export function sampleCloudTops(
  data: Uint8Array,
  worldX: number,
  worldZ: number,
  fieldScale: number,
): number {
  return bilinearChannel(data, worldX / fieldScale, worldZ / fieldScale, 3);
}

/** The fine octave that erodes a dome into a cauliflower. */
export function sampleCloudDetail(
  data: Uint8Array,
  worldX: number,
  worldZ: number,
  fieldScale: number,
): number {
  return bilinearChannel(data, worldX / fieldScale, worldZ / fieldScale, 1);
}

export function weatherFieldOrigin(
  weather: SkyWeather,
): readonly [x: number, z: number] {
  return weather.fieldOrigin ?? [0, 0];
}

export function weatherShearMetres(weather: SkyWeather): number {
  return weather.shear ?? CLOUD_LAW.shear;
}

/** How far the deck leans downwind at a given height through it. */
export function cloudShear(
  weather: SkyWeather,
  height: number,
): readonly [x: number, z: number] {
  const lean = weatherShearMetres(weather) * height;
  return [Math.cos(weather.windBearing) * lean, Math.sin(weather.windBearing) * lean];
}

/**
 * Water at a world point, before extinction. This is the law the sky shader's
 * `cloudSample` mirrors, and the reason both can be trusted to describe the
 * same cloud: a flat base that takes a moment to fill in, a silhouette that
 * shrinks with height into a dome rather than a prism, a top that frays, and
 * a fine octave that bites hardest near that top.
 *
 * The lean is applied FIRST, by height, before anything is read. That is not
 * cosmetic ordering: it puts the shape, the billow and the column's own depth
 * at one and the same point of the field, so on the GPU all three come out of
 * a single texel instead of three lookups.
 */
export function cloudDensityAt(
  data: Uint8Array,
  weather: SkyWeather,
  worldX: number,
  worldY: number,
  worldZ: number,
  drift: readonly [x: number, z: number],
): number {
  if (weather.coverage <= 0) return 0;
  const height = (worldY - weather.baseAltitude) / weather.thickness;
  if (height < 0 || height > 1) return 0;
  const [leanX, leanZ] = cloudShear(weather, height);
  const [originX, originZ] = weatherFieldOrigin(weather);
  const atX = worldX - originX - drift[0] + leanX;
  const atZ = worldZ - originZ - drift[1] + leanZ;
  const rise = CLOUD_LAW.topFloor
    + (1 - CLOUD_LAW.topFloor) * sampleCloudTops(data, atX, atZ, weather.fieldScale);
  const climb = height / rise;
  if (climb >= 1) return 0;
  const over = sampleCloudField(data, atX, atZ, weather.fieldScale)
    - cloudEdgeFor(weather.coverage)
    - CLOUD_LAW.shoulder * climb * climb;
  if (over <= 0) return 0;
  const body = smoothstep(0, CLOUD_LAW.edgeSoftness, over)
    * (CLOUD_LAW.coreFloor + CLOUD_LAW.coreGain * over)
    * smoothstep(0, CLOUD_LAW.baseRamp, climb)
    * (1 - smoothstep(CLOUD_LAW.topFade, 1, climb));
  if (body <= 0) return 0;
  const detail = sampleCloudDetail(data, atX, atZ, weather.fieldScale);
  const climbBite = CLOUD_LAW.erosion
    * smoothstep(CLOUD_LAW.erosionOnset, 1, climb)
    * detail;
  // Rim only: same mass, torn edge. Cell hash is seeded by the leaned point
  // so CPU shadow and GPU silhouette agree without a third field tap.
  const fringeMask = 1 - smoothstep(0, CLOUD_LAW.fringeWidth, over);
  const cellX = Math.floor((atX / weather.fieldScale) * CLOUD_LAW.fringeFrequency);
  const cellZ = Math.floor((atZ / weather.fieldScale) * CLOUD_LAW.fringeFrequency);
  const fine = fract(Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453);
  const fringeBite = CLOUD_LAW.fringeErosion
    * fringeMask
    * (0.4 + 0.6 * climb)
    * (detail * 0.45 + fine * 0.55);
  return Math.max(body * (1 - climbBite - fringeBite), 0);
}

/** How far a ray is walked through the deck before haze has eaten all of it. */
export function cloudReach(weather: SkyWeather): number {
  return extinctionLength(weather) * CLOUD_LAW.reachInHazes;
}

/** Steps and step length the march uses for a ray of this path length. */
export function cloudMarchSteps(
  weather: SkyWeather,
  through: number,
): readonly [count: number, stepLength: number] {
  const wanted = Math.floor(through / (weather.fieldScale * CLOUD_LAW.stepSpan));
  const count = Math.max(CLOUD_LAW.minSteps, Math.min(CLOUD_LAW.maxSteps, wanted));
  return [count, through / count];
}

/**
 * Mip level the march reads at a given step length: the one whose texel is as
 * wide as a step. Anything finer than a step cannot be resolved by it, so it
 * is filtered away instead of aliased into stripes.
 */
export function cloudMarchLod(weather: SkyWeather, stepLength: number): number {
  const level = Math.log2((stepLength * SKY_FIELD_SIZE) / weather.fieldScale);
  return Math.max(0, Math.min(CLOUD_LAW.maxLod, level));
}

/** Henyey–Greenstein, normalised over the sphere. */
function hgPhase(cosAngle: number, g: number): number {
  const g2 = g * g;
  return (1 - g2) / (4 * Math.PI * (1 + g2 - 2 * g * cosAngle) ** 1.5);
}

/**
 * Both lobes of a water droplet — a strong forward one and a weak back one, so
 * a heap is a silver rim from one side and never dead from the other —
 * flattened toward isotropic by `spread`.
 */
export function cloudPhase(cosAngle: number, spread: number): number {
  return (
    hgPhase(cosAngle, CLOUD_LAW.phaseForward * spread) * CLOUD_LAW.phaseMix
    + hgPhase(cosAngle, CLOUD_LAW.phaseBack * spread) * (1 - CLOUD_LAW.phaseMix)
  ) * 4 * Math.PI;
}

/**
 * Sunlight reaching a point at this optical depth, summed over octaves of
 * multiple scattering: each successive bounce is fainter, less attenuated and
 * less aimed.
 *
 * Neither half can be dropped. A single Beer term leaves the middle of a cloud
 * black; a single raw phase function swings the sky fifty-fold between towards
 * the sun and away from it, so every heap off-axis reads as a grey stain.
 */
export function cloudSunEnergy(sunDepth: number, cosSun: number): number {
  let weight = 1;
  let extinction = 1;
  let spread = 1;
  let energy = 0;
  for (let octave = 0; octave < CLOUD_LAW.scatterOctaves; octave += 1) {
    energy += weight * Math.exp(-sunDepth * extinction) * cloudPhase(cosSun, spread);
    weight *= CLOUD_LAW.scatterFalloff;
    extinction *= CLOUD_LAW.scatterTransmit;
    spread *= CLOUD_LAW.scatterSpread;
  }
  return Math.min(energy, CLOUD_LAW.scatterCeiling);
}

/**
 * Opacity of the deck along a ray, 0..1. The sky shader walks the same path
 * with the same steps; this is what the CPU asks when it needs to know how
 * much cloud is between two things.
 */
export function cloudOpacityAlong(
  data: Uint8Array,
  weather: SkyWeather,
  origin: readonly [x: number, y: number, z: number],
  direction: readonly [x: number, y: number, z: number],
  drift: readonly [x: number, z: number],
): number {
  if (weather.coverage <= 0 || direction[1] < 0.006) return 0;
  const baseT = (weather.baseAltitude - origin[1]) / direction[1];
  if (baseT <= 0) return 0;
  const through = Math.min(weather.thickness / direction[1], cloudReach(weather));
  const [count, stepLength] = cloudMarchSteps(weather, through);
  let transmittance = 1;
  for (
    let step = 0;
    step < count && transmittance > CLOUD_LAW.exitTransmittance;
    step += 1
  ) {
    const t = baseT + stepLength * (step + 0.5);
    const density = cloudDensityAt(
      data,
      weather,
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
      drift,
    ) * weather.density;
    if (density <= 0) continue;
    transmittance *= Math.exp(-density * stepLength);
  }
  return 1 - transmittance;
}

/** How far the deck has travelled, in metres of world, at a given moment. */
export function cloudDrift(
  weather: SkyWeather,
  seconds: number,
): readonly [x: number, z: number] {
  const distance = weather.windSpeed * seconds;
  return [
    Math.cos(weather.windBearing) * distance,
    Math.sin(weather.windBearing) * distance,
  ];
}

/**
 * The silhouette of the deck's base over a world point, 0..1. This is what
 * `coverage` is a measurement of, and it takes no account of how deep the
 * column is — for that, ask `cloudCoverAt`.
 */
export function cloudSilhouetteAt(
  data: Uint8Array,
  weather: SkyWeather,
  worldX: number,
  worldZ: number,
  drift: readonly [x: number, z: number],
): number {
  const [originX, originZ] = weatherFieldOrigin(weather);
  return shapeCloudField(
    sampleCloudField(
      data,
      worldX - originX - drift[0],
      worldZ - originZ - drift[1],
      weather.fieldScale,
    ),
    weather.coverage,
  );
}

/**
 * Shaded cloud cover over a world point right now, 0..1 — the opacity of the
 * whole column overhead, so a shallow puff shades the polder less than a
 * congestus does. The ground shadow and the sun-occlusion query both come from
 * here, so what darkens the field is always the cloud overhead.
 */
export function cloudCoverAt(
  data: Uint8Array,
  weather: SkyWeather,
  worldX: number,
  worldZ: number,
  drift: readonly [x: number, z: number],
): number {
  return cloudOpacityAlong(data, weather, [worldX, 0, worldZ], [0, 1, 0], drift);
}

/**
 * Cloud between a world point and the sun. The ray is walked through the deck
 * the same way the sky is, which is the only honest way to know whether the
 * sun is actually behind a cloud from here: at a low sun that ray crosses
 * kilometres of deck, and sampling one column straight overhead said nothing
 * about it.
 */
export function sunOcclusionAt(
  data: Uint8Array,
  weather: SkyWeather,
  worldX: number,
  worldY: number,
  worldZ: number,
  sunDirection: readonly [x: number, y: number, z: number],
  drift: readonly [x: number, z: number],
): number {
  // A sun below the horizon is already out of the picture.
  if (sunDirection[1] <= 0.004) return 0;
  return cloudOpacityAlong(data, weather, [worldX, worldY, worldZ], sunDirection, drift);
}

/**
 * Fraction of the sky dome an observer actually sees covered, which is not
 * `coverage`: every ray that is not straight up crosses the deck at a slant.
 * Sampled over the hemisphere, weighted by solid angle.
 */
export function domeCoverage(
  data: Uint8Array,
  weather: SkyWeather,
  drift: readonly [x: number, z: number] = [0, 0],
  rings = 24,
  spokes = 48,
): number {
  let covered = 0;
  let total = 0;
  for (let ring = 0; ring < rings; ring += 1) {
    // Equal-area rings: sin(elevation) uniform over 0..1.
    const sinElevation = (ring + 0.5) / rings;
    const cosElevation = Math.sqrt(Math.max(0, 1 - sinElevation * sinElevation));
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const azimuth = ((spoke + 0.5) / spokes) * Math.PI * 2;
      const opacity = cloudOpacityAlong(
        data,
        weather,
        [0, 2, 0],
        [Math.cos(azimuth) * cosElevation, sinElevation, Math.sin(azimuth) * cosElevation],
        drift,
      );
      if (opacity >= 0.5) covered += 1;
      total += 1;
    }
  }
  return covered / total;
}
