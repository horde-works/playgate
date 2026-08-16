/**
 * RIVETED ALCLAD SKIN: THE SEAM AND RIVET LATTICE.
 *
 * Every number here is measured, and the measurement is written down:
 * `games/make-a-mess/docs/dc-3/skin-seam-passport-p01.md`. Nothing in this
 * file may be tuned by eye — a value that stops matching the passport is a
 * failing test, not a taste call.
 *
 * Three findings shape the whole design, and each one contradicts the obvious
 * first guess:
 *
 *  - a lap seam is a SOFT BAND about 18 mm wide at 5% contrast, not a hairline.
 *    A thin dark line reads as a decal, because a real joint is an order of
 *    magnitude wider and several times weaker than a drawn line;
 *  - a rivet is a BRIGHT specular head (+25%) with its own shadow beside it
 *    (-21%), not a dark dot. A dark dot reads as dirt on paint;
 *  - panel-to-panel scatter belongs mostly to curvature and the environment
 *    map, which the renderer already produces. Only sigma 4% belongs to the
 *    material. Baking the 10-30% seen in photographs into albedo would stack
 *    on top of honest reflection and give blotchy tin.
 *
 * The lattice is a field in body metres, never a texture map. The triplanar
 * projection plane is chosen per VERTEX from `abs(normal)`, so on a lofted
 * skin two vertices of one triangle can pick different planes; a mapped grid
 * smears in that band. Alclad's uniform noise hides this today. A lattice
 * would not.
 */

export interface SkinSeamLattice {
  /** Rivet spacing along a row, metres. */
  readonly rivetPitch: number;
  /** Visible head diameter, metres (15% of pitch, measured). */
  readonly rivetHeadWidth: number;
  /** Head brightness above the local mean. */
  readonly rivetCrest: number;
  /** Shadow depth beside the head, below the local mean. */
  readonly rivetShadow: number;
  /** Skin-to-stringer rivet rows, metres. */
  readonly stringerRowPitch: number;
  /** Lap joints between sheets: every second row is one, metres. */
  readonly lapSeamPitch: number;
  /** Circumferential joints across the run of the skin, metres. */
  readonly frameSeamPitch: number;
  /** Bright lip on the overlapping side of a lap. */
  readonly seamCrest: number;
  /** Shaded step on the far side of a lap. */
  readonly seamTrough: number;
  /** Width of the whole soft band, metres. */
  readonly seamWidth: number;
  /** Per-panel albedo scatter that belongs to the material, not the sky. */
  readonly panelTintSigma: number;
  /** Per-panel roughness scatter. */
  readonly panelRoughnessSigma: number;
  /**
   * Oil-canning: how far the middle of a panel stands off the chord between
   * its supports, metres. AUTHORED, not measured — see the passport, §5.3a.
   *
   * This is the missing half of the passport's own model. §5.3 assigns most of
   * the observed panel scatter to curvature and the environment map, and a
   * lofted skin has neither: it is geometrically perfect, so every panel
   * catches the sky at exactly the angle its neighbour does. The number is
   * calibrated so the RENDERED neighbour-to-neighbour step lands in the
   * measured 6-8% band, which is what §5.3 actually constrains.
   */
  readonly panelOilCanDepth: number;
  /**
   * Wavelength of section-scale tone, metres. AUTHORED.
   *
   * Everything finer than about 0.15 m is below Nyquist past forty metres, so
   * no panel-scale family can survive there — the skin goes to flat satin no
   * matter how the panel families are tuned. A real airframe still reads
   * mottled at that range because sheets from different batches, repairs and
   * uneven weathering vary over metres, not centimetres. That band is
   * unmeasured by P01, which sampled neighbours, not sections.
   */
  readonly sectionTintPitch: number;
  /** Amplitude of section-scale tone. AUTHORED. */
  readonly sectionTintSigma: number;
}

/**
 * NASM A19530075000, natural Alclad. Passport P01.
 *
 * The cell is 0.50 x 0.15 m — stretched better than three to one along the
 * run of the skin. A square cell is generic riveted tin, not this aeroplane.
 */
export const ALCLAD_SEAM_LATTICE: SkinSeamLattice = {
  rivetPitch: 0.028,
  rivetHeadWidth: 0.004,
  rivetCrest: 0.25,
  rivetShadow: 0.21,
  stringerRowPitch: 0.075,
  lapSeamPitch: 0.15,
  frameSeamPitch: 0.5,
  seamCrest: 0.05,
  seamTrough: 0.026,
  seamWidth: 0.018,
  panelTintSigma: 0.04,
  panelRoughnessSigma: 0.03,
  panelOilCanDepth: 0.0012,
  sectionTintPitch: 3.2,
  sectionTintSigma: 0.05,
};

/**
 * Signed distance to the nearest line of a family, metres. Lines sit on the
 * multiples of the pitch, so the origin of the body frame is on a line and a
 * reader can predict where a seam lands without running the shader.
 */
export function seamOffset(coordinate: number, pitch: number): number {
  const phase = coordinate / pitch + 0.5;
  return (phase - Math.floor(phase) - 0.5) * pitch;
}

/**
 * Cross-section of one lap joint as a fraction of the local mean.
 *
 * The overlapping sheet catches light on a long ramp; the shaded step follows
 * it. That asymmetric pair is what reads as folded metal — a symmetric dark
 * groove reads as a scratch.
 */
export function seamShade(
  offset: number,
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): number {
  const x = offset / lattice.seamWidth;
  const lip = Math.max(0, 1 - Math.abs(x + 0.5) * 2);
  const step = Math.max(0, 1 - Math.abs(x - 0.4) * 2.5);
  return lattice.seamCrest * lip - lattice.seamTrough * step;
}

/**
 * Rivet head and its shadow at a point, as fractions of the local mean.
 * `along` runs down the row, `across` steps between rows.
 */
export function rivetShade(
  along: number,
  across: number,
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): { readonly head: number; readonly shadow: number } {
  const rowOffset = seamOffset(across, lattice.stringerRowPitch);
  const seatOffset = seamOffset(along, lattice.rivetPitch);
  const radius = Math.hypot(rowOffset, seatOffset);
  const head = falloff(radius, lattice.rivetHeadWidth * 0.5, lattice.rivetHeadWidth * 0.85);
  const shadowRadius = Math.hypot(
    rowOffset + lattice.rivetHeadWidth * 0.55,
    seatOffset,
  );
  const shadow = falloff(
    shadowRadius,
    lattice.rivetHeadWidth * 0.5,
    lattice.rivetHeadWidth * 0.9,
  );
  return { head, shadow };
}

function falloff(value: number, inner: number, outer: number): number {
  if (value <= inner) return 1;
  if (value >= outer) return 0;
  const t = (value - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** Which panel a point belongs to. Panels are the unit of the quilt. */
export function panelCell(
  along: number,
  across: number,
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): readonly [number, number] {
  return [
    Math.floor(along / lattice.frameSeamPitch),
    Math.floor(across / lattice.lapSeamPitch),
  ];
}

/**
 * Albedo multiplier of one panel. Neighbouring panels must differ; the
 * measured median step between neighbours along the axis is 6-8%, which an
 * independent per-panel offset of sigma 4% reproduces.
 */
export function panelTint(
  along: number,
  across: number,
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): number {
  const [cellAlong, cellAcross] = panelCell(along, across, lattice);
  return 1 + (hash(cellAlong, cellAcross) - 0.5) * 2 * lattice.panelTintSigma;
}

/** Same hash the shader uses, so a panel keeps one identity in both. */
export function hash(a: number, b: number): number {
  const value = Math.sin(a * 41.7 + b * 17.3) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * The fragment-shader half of the same law.
 *
 * Written out here rather than in `materialTextures.ts` so the constants have
 * exactly one home: a test asserts that every number above appears in this
 * source, which is what stops the shader and the passport from drifting
 * apart the first time someone nudges a value to taste.
 */
export function alcladSeamGlsl(
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): string {
  const n = (value: number): string => value.toFixed(4);
  return /* glsl */ `
// Lap joint cross-section: a bright lip on the overlapping side and a shaded
// step after it. Soft and wide on purpose — see skinSeamLattice.ts.
float alcladSeamShade(float offset) {
  float x = offset / ${n(lattice.seamWidth)};
  float lip = max(0.0, 1.0 - abs(x + 0.5) * 2.0);
  float step_ = max(0.0, 1.0 - abs(x - 0.4) * 2.5);
  return ${n(lattice.seamCrest)} * lip - ${n(lattice.seamTrough)} * step_;
}

float alcladOffset(float coordinate, float pitch) {
  return (fract(coordinate / pitch + 0.5) - 0.5) * pitch;
}

// A family fades out once one period no longer covers a pixel. Without this
// the 28 mm rivet pitch turns to moire from thirty metres out; with it the
// row dissolves into slightly rougher satin, which is what the eye expects.
float alcladResolve(float coordinate, float pitch) {
  return 1.0 - smoothstep(0.16, 0.45, fwidth(coordinate / pitch));
}

float alcladPanelHash(vec2 cell) {
  return fract(sin(cell.x * 41.7 + cell.y * 17.3) * 43758.5453);
}

// Section-scale tone, in the range -1..1. Two incommensurate waves rather than
// hashed cells on purpose: this family has to survive to forty metres and
// beyond, where a cell edge would be a hard sub-pixel step and would crawl.
// A band-limited field cannot alias, so it needs no resolve gate at all.
float alcladSectionTone(vec3 bodyCoordinate) {
  float coarse = 6.2831853 / ${n(lattice.sectionTintPitch)};
  float fine = 6.2831853 / ${n(lattice.sectionTintPitch * 0.45)};
  float wave =
    sin(dot(bodyCoordinate, vec3(0.77, 0.51, -0.36) * coarse))
    + 0.6 * sin(dot(bodyCoordinate, vec3(-0.39, 0.91, 0.60) * fine) + 2.1);
  return wave / 1.6;
}
`;
}

/**
 * The block that runs inside `map_fragment`. It leaves `alcladRivetHead`
 * behind for the roughness stage: a struck head is polished, and dropping its
 * roughness is most of what makes it read as metal rather than a pale dot.
 */
export function alcladSeamFragment(
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): string {
  const n = (value: number): string => value.toFixed(4);
  return /* glsl */ `
// RIVETED ALCLAD. The lattice runs with the piece: rings cross its longest
// axis, strips run along it. That is right for a fuselage (rings are
// circumferential joints) and for a wing (rings are rib lines, strips run
// spanwise) without a second law.
vec3 alcladScale = vMaterialWorldScale;
vec3 alcladNormal = abs(vMaterialSurfaceNormal);
float alcladAlong;
float alcladAcross;
if (alcladScale.x >= alcladScale.y && alcladScale.x >= alcladScale.z) {
  alcladAlong = vMaterialCoordinate.x;
  alcladAcross = alcladNormal.y > alcladNormal.z ? vMaterialCoordinate.z : vMaterialCoordinate.y;
} else if (alcladScale.y >= alcladScale.z) {
  alcladAlong = vMaterialCoordinate.y;
  alcladAcross = alcladNormal.x > alcladNormal.z ? vMaterialCoordinate.z : vMaterialCoordinate.x;
} else {
  alcladAlong = vMaterialCoordinate.z;
  alcladAcross = alcladNormal.x > alcladNormal.y ? vMaterialCoordinate.y : vMaterialCoordinate.x;
}

// The quilt. Most of the scatter a photograph shows is curvature and sky;
// only this much belongs to the panel itself.
vec2 alcladCell = vec2(
  floor(alcladAlong / ${n(lattice.frameSeamPitch)}),
  floor(alcladAcross / ${n(lattice.lapSeamPitch)})
);
float alcladPanel = alcladPanelHash(alcladCell);
diffuseColor.rgb *= 1.0 + (alcladPanel - 0.5) * ${n(lattice.panelTintSigma * 2)};

// Section-scale tone. Past forty metres every panel family is below Nyquist
// and averages to flat satin; this band is metres long, so it is the only
// thing that can still read as skin at that range.
diffuseColor.rgb *= 1.0
  + alcladSectionTone(vMaterialCoordinate) * ${n(lattice.sectionTintSigma)};

// Joints: circumferential across the run, lap seams along it, and the lighter
// skin-to-stringer rows between the laps.
float alcladRingFade = alcladResolve(alcladAlong, ${n(lattice.frameSeamPitch)});
float alcladLapFade = alcladResolve(alcladAcross, ${n(lattice.lapSeamPitch)});
float alcladRowFade = alcladResolve(alcladAcross, ${n(lattice.stringerRowPitch)});
float alcladSeam =
  alcladSeamShade(alcladOffset(alcladAlong, ${n(lattice.frameSeamPitch)})) * alcladRingFade
  + alcladSeamShade(alcladOffset(alcladAcross, ${n(lattice.lapSeamPitch)})) * alcladLapFade
  + alcladSeamShade(alcladOffset(alcladAcross, ${n(lattice.stringerRowPitch)})) * 0.6 * alcladRowFade;
diffuseColor.rgb *= 1.0 + alcladSeam;

// Rivets sit on the stringer rows and on the circumferential joints.
float alcladRowOffset = alcladOffset(alcladAcross, ${n(lattice.stringerRowPitch)});
float alcladSeatOffset = alcladOffset(alcladAlong, ${n(lattice.rivetPitch)});
float alcladHeadRadius = length(vec2(alcladRowOffset, alcladSeatOffset));
float alcladRivetFade = min(
  alcladRowFade,
  alcladResolve(alcladAlong, ${n(lattice.rivetPitch)})
);
float alcladRivetHead = (1.0 - smoothstep(
  ${n(lattice.rivetHeadWidth * 0.5)},
  ${n(lattice.rivetHeadWidth * 0.85)},
  alcladHeadRadius
)) * alcladRivetFade;
float alcladShadowRadius = length(vec2(
  alcladRowOffset + ${n(lattice.rivetHeadWidth * 0.55)},
  alcladSeatOffset
));
float alcladRivetShadow = (1.0 - smoothstep(
  ${n(lattice.rivetHeadWidth * 0.5)},
  ${n(lattice.rivetHeadWidth * 0.9)},
  alcladShadowRadius
)) * alcladRivetFade;
diffuseColor.rgb *= 1.0
  + alcladRivetHead * ${n(lattice.rivetCrest)}
  - alcladRivetShadow * ${n(lattice.rivetShadow)};
`;
}

/**
 * The normal half: oil-canning.
 *
 * A real panel is not flat. It stands off the chord between its supports by a
 * millimetre or so, and that tiny curvature is what makes neighbouring panels
 * reflect the sky at different angles — the mechanism §5.3 of the passport
 * credits with most of the observed scatter, and the one a lofted skin lacks
 * entirely. Without it the quilt can only live in albedo, and albedo scatter
 * on metal reads as dirt rather than as sheet.
 *
 * The tangent frame is rebuilt from screen-space derivatives rather than
 * carried in varyings: this shader is already close to the interpolator
 * budget, and the lattice coordinates are plain metres, so the standard
 * derivative-map solve applies directly.
 */
export function alcladSeamNormal(
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): string {
  const n = (value: number): string => value.toFixed(4);
  const halfAlong = lattice.frameSeamPitch * 0.5;
  const halfAcross = lattice.lapSeamPitch * 0.5;
  return /* glsl */ `
vec3 alcladViewPosition = -vViewPosition;
vec3 alcladPositionDx = dFdx(alcladViewPosition);
vec3 alcladPositionDy = dFdy(alcladViewPosition);
vec2 alcladLatticeDx = vec2(dFdx(alcladAlong), dFdx(alcladAcross));
vec2 alcladLatticeDy = vec2(dFdy(alcladAlong), dFdy(alcladAcross));
float alcladFrameDet =
  alcladLatticeDx.x * alcladLatticeDy.y - alcladLatticeDy.x * alcladLatticeDx.y;
if (abs(alcladFrameDet) > 1e-12) {
  vec3 alcladTangentAlong = (
    alcladLatticeDy.y * alcladPositionDx - alcladLatticeDx.y * alcladPositionDy
  ) / alcladFrameDet;
  vec3 alcladTangentAcross = (
    alcladLatticeDx.x * alcladPositionDy - alcladLatticeDy.x * alcladPositionDx
  ) / alcladFrameDet;
  // Position inside the panel, -1 at one edge and +1 at the other.
  float alcladPanelU = alcladOffset(alcladAlong, ${n(lattice.frameSeamPitch)}) / ${n(halfAlong)};
  float alcladPanelV = alcladOffset(alcladAcross, ${n(lattice.lapSeamPitch)}) / ${n(halfAcross)};
  // Some panels bulge, some dish: the sign comes from the panel's own hash, so
  // a panel keeps one identity in tone, sheen and curvature alike.
  float alcladBulge = (alcladPanel - 0.5) * 2.0 * ${n(lattice.panelOilCanDepth)};
  float alcladSlopeAlong = alcladBulge
    * (-2.0 * alcladPanelU / ${n(halfAlong)})
    * (1.0 - alcladPanelV * alcladPanelV)
    * alcladRingFade;
  float alcladSlopeAcross = alcladBulge
    * (1.0 - alcladPanelU * alcladPanelU)
    * (-2.0 * alcladPanelV / ${n(halfAcross)})
    * alcladLapFade;
  normal = normalize(
    normal
      - alcladSlopeAlong * normalize(alcladTangentAlong)
      - alcladSlopeAcross * normalize(alcladTangentAcross)
  );
}
`;
}

/** The roughness half. Panels differ in sheen; a struck head is polished. */
export function alcladSeamRoughness(
  lattice: SkinSeamLattice = ALCLAD_SEAM_LATTICE,
): string {
  const n = (value: number): string => value.toFixed(4);
  return /* glsl */ `
roughnessFactor = clamp(
  roughnessFactor + (alcladPanel - 0.5) * ${n(lattice.panelRoughnessSigma * 2)},
  0.08,
  1.0
);
roughnessFactor = mix(roughnessFactor, 0.1, alcladRivetHead * 0.7);
`;
}
