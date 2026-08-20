import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Kallur carpet lab — an offline A/B stand for the turf "carpet" formulas
 * (bible §II + the close-crop analysis of reference-02).
 *
 * Renders the SAME math destined for the kallur ground shader band, CPU-side
 * and per-pixel, over a synthetic mid-distance patch in daylight. Six tiles:
 *
 *   A  today: isotropic value-noise brightness mottle (what is live now)
 *   B  emboss: noise as HEIGHT, lit by the sun's derivative + dark AO roots
 *   C  cells: Worley polster net baked into ALBEDO only (crowns + seam web)
 *   D  cells + relief: C with domed cells, sun shading and AO
 *   E  full carpet: D + downslope anisotropy x1.4 + fine stipple grain
 *   F  E + stones bedded in sockets with dark moats
 *
 * Second round (after Igor's doubt about the craquelure): the reference's
 * organizing structure is NOT a closed cell net — it is a system of BROKEN
 * BLANKET FOLDS, elongated along the contour lines, branching and fading.
 * That is bible II.1-2 (kochki + terracettes), which the cells quietly
 * replaced. New tiles:
 *
 *   G  wrinkles: blanket-fold relief instead of cells (shag stays dominant)
 *   H  G + color slaved to relief: crests dry straw, creases wet dark
 *   I  H + pile optics: wrap light, crest sheen, sparkle scaled by light
 *   J  I + bedded stones
 *   K  I + a faint cell undertone (hybrid, in case pure folds feel empty)
 *
 * Patch: 4.0 x 3.0 m, ~3.3 mm per pixel, sun from the upper-left at ~45
 * degrees like the reference crop. Palette is the measured overcast set.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repositoryRoot, "games/make-a-mess/docs/kallur/carpet-lab");

const WIDTH = 1100;
const HEIGHT = 820;
const PATCH_W = 4.0;
const PATCH_H = 3.0;

const SUN = normalize3([-0.55, 0.72, -0.42]);
// Slope-law tiles face downhill toward the viewer's lower edge; the sun
// swings to light that face, as in the reference of the lit hillside.
const SUN_SLOPE = normalize3([-0.5, 0.72, 0.45]);
const SUN_COLOR = [1.06, 1.0, 0.9];
const SKY_COLOR = [0.52, 0.56, 0.62];
// The mid reference's "atmosphere" is a temperature STORY, not a palette:
// sun warms the lit faces toward straw-yellow, the sky cools every shadow
// toward blue-green, and a whiff of haze already lives at thirty metres.
const SUN_WARM = [1.18, 1.04, 0.72];
const SKY_COOL = [0.4, 0.52, 0.68];
const HAZE = [0.72, 0.76, 0.7];

const GRASS_BASE = hex("#6d7046");
const GRASS_ALT = hex("#757641");
const GRASS_LIT = hex("#b3b374");
const SEAM_DARK = hex("#3a4426");
const MOSS_YELLOW = hex("#8f8d52");
const STRAW = hex("#c7c084");
const DEAD_THATCH = hex("#71603a");
const STONE_MID = hex("#8f958d");
const STONE_LICHEN = hex("#b9bdb4");

const STONES = [
  { x: 1.05, z: 0.85, r: 0.16 },
  { x: 2.9, z: 1.9, r: 0.24 },
  { x: 0.55, z: 2.3, r: 0.1 },
  { x: 3.45, z: 0.55, r: 0.09 },
  { x: 1.95, z: 2.65, r: 0.12 },
];

function hex(value) {
  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function normalize3([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hash2(ix, iz, seed) {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(0, 1, x - ix);
  const fz = smoothstep(0, 1, z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fz) * 2 - 1;
}

/** Worley cellular field: F1/F2 distances and the owning cell's hash. */
function worley(x, z, cellSize, seed) {
  const gx = Math.floor(x / cellSize);
  const gz = Math.floor(z / cellSize);
  let f1 = Infinity;
  let f2 = Infinity;
  let owner = 0;
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      const cx = gx + ox;
      const cz = gz + oz;
      const px = (cx + hash2(cx, cz, seed)) * cellSize;
      const pz = (cz + hash2(cx, cz, seed + 7)) * cellSize;
      const distance = Math.hypot(x - px, z - pz);
      if (distance < f1) {
        f2 = f1;
        f1 = distance;
        owner = hash2(cx, cz, seed + 13);
      } else if (distance < f2) {
        f2 = distance;
      }
    }
  }
  return { f1: f1 / cellSize, f2: f2 / cellSize, owner };
}

function stoneAt(x, z) {
  for (const stone of STONES) {
    const rawDistance = Math.hypot(x - stone.x, z - stone.z);
    if (rawDistance >= stone.r * 1.45 + 0.14) continue;
    // An irregular crown, not a billiard ball: the radius breathes with the
    // angle, so the sod line around the stone is ragged like the reference.
    const angle = Math.atan2(z - stone.z, x - stone.x);
    const wobble = 0.92 +
      0.11 * valueNoise(Math.cos(angle) * 1.4 + stone.x * 9, Math.sin(angle) * 1.4 + stone.z * 9, 57);
    const distance = rawDistance / wobble;
    if (distance < stone.r + 0.14) return { stone, distance };
  }
  return null;
}

/**
 * Height field per variant. The base slope and kochki are shared; polster
 * domes, seam creases, stipple and stones switch with the variant flags.
 */
function makeField(flags) {
  const aniso = flags.anisotropy ? 1.4 : 1;

  // Domain warp kills the CAD-Voronoi look: cells become organic polsters.
  const warp = (x, z) => [
    x + valueNoise(x / 0.55, z / 0.55, 145) * 0.055,
    z + valueNoise(x / 0.55, z / 0.55, 146) * 0.055,
  ];
  const cellField = (x, z) => {
    const [wx, wz] = warp(x, z);
    return worley(wx, wz / aniso, 0.17, 21);
  };
  const familyField = (x, z) => {
    const [wx, wz] = warp(x, z);
    return worley(wx, wz / aniso, 0.7, 77);
  };
  // The seam web is BROKEN: half the seams fade away, like real sod.
  const seamStrength = (x, z) =>
    0.25 + 0.75 * smoothstep(-0.5, 0.5, valueNoise(x / 0.9, z / 0.9, 203));

  // Blanket-fold field (round two). Ridged noise stretched ALONG the contour
  // (x): its zero-crossings become wandering creases mostly parallel to the
  // horizontals, branching where octaves disagree — terracettes' little
  // sibling, never a closed polygon. fold=1 on hummock backs, crease peaks
  // in the dips, and continuity breaks the lines like real sod.
  const wrinkleAt = (x, z) => {
    // Round three: packed CUSHIONS, not incised folds. Ridged noise gave
    // melted wax — plateaus with canyon creases. The reference is convex
    // everywhere: rounded elliptical domes pressed together, the "creases"
    // being nothing but the shadowed gaps between neighbours. Two Worley
    // scales in a contour-stretched, double-warped domain. The craquelure
    // of round one died of scale (0.17 m) and of drawn albedo lines —
    // these are ~0.85 x 0.45 m pillows whose seams exist only as relief
    // and occlusion.
    const wx = x + valueNoise(x / 1.6, z / 1.6, 301) * 0.35 +
      valueNoise(x / 0.3, z / 0.3, 304) * 0.04;
    const wz = z + valueNoise(x / 1.3, z / 1.3, 302) * 0.22 +
      valueNoise(x / 0.26, z / 0.26, 305) * 0.04;
    const big = worley(wx / 1.9, wz, 0.45, 331);
    const small = worley(wx / 1.5, wz, 0.26, 332);
    const bigDome = Math.pow(clamp01(1 - big.f1), 0.75) * (0.72 + big.owner * 0.55);
    const smallDome = Math.pow(clamp01(1 - small.f1), 0.85) * (0.6 + small.owner * 0.7);
    const fold = clamp01(bigDome * 0.75 + smallDome * 0.42);
    const continuity = 0.35 + 0.65 * smoothstep(-0.45, 0.5, valueNoise(x / 1.5, z / 1.5, 313));
    const crease = smoothstep(0.2, 0.03, big.f2 - big.f1) * continuity;
    return { fold, crease };
  };

  // Igor's two patterns, literally (17.08): "ландшафтность в текстуре" and
  // "самоподобие — текстура в текстуре в текстуре". One generator with hill
  // morphology — billowed value noise, rounded tops and pinched hollows —
  // repeated self-similarly from 1.7 m down past the pixel. No Worley: any
  // cell skeleton eventually shows its straight bones, while billow creases
  // are smooth wandering curves by construction. Coarse octaves lean along
  // the contour (terracette tendency), fine ones relax to isotropy.
  // Every octave gets its OWN domain rotation — a shared axis-aligned
  // lattice reads as woven squares once the billow sharpens it. Coarse
  // octaves stay near the contour direction, fine ones scatter freely.
  // Slopes GROW toward fine octaves (persistence 0.62 vs wavelength 0.5):
  // the reference's small hummocks are steeper than its big waves, and the
  // steepening is what keeps every scale visible in the light.
  const CASCADE_ANGLES = [0, 0.35, -0.3, 0.8, -0.75, 1.2, -1.1];
  const CASCADE = [];
  {
    let amplitude = 0.12;
    let wavelength = 1.7;
    let stretch = 1.6;
    for (let i = 0; i < 7; i += 1) {
      CASCADE.push({
        amplitude,
        wavelength,
        stretch,
        seed: 401 + i * 17,
        cos: Math.cos(CASCADE_ANGLES[i]),
        sin: Math.sin(CASCADE_ANGLES[i]),
      });
      amplitude *= 0.62;
      wavelength *= 0.5;
      stretch = 1 + (stretch - 1) * 0.7;
    }
  }
  const cascadeOctave = (x, z, index) => {
    const octave = CASCADE[index];
    const rx = x * octave.cos - z * octave.sin;
    const rz = x * octave.sin + z * octave.cos;
    const sample = valueNoise(
      rx / (octave.wavelength * octave.stretch),
      rz / octave.wavelength,
      octave.seed,
    );
    // Hill-in-hill morphology (billow: rounded tops, pinched hollows) holds
    // down to ~10 cm; below that the surface is pile, and billow's fine
    // creases curl into worm-cast loops. The last octaves go plain.
    return index < 5 ? Math.abs(sample) : sample * 0.5 + 0.5;
  };
  const foldAt = flags.cascade
    ? (x, z) => clamp01(cascadeOctave(x, z, 1) * 0.75 + cascadeOctave(x, z, 2) * 0.5)
    : (x, z) => wrinkleAt(x, z).fold;

  // Round three — the slope law (Igor, 17.08): at mid-far the landform is
  // the SENIOR octave of the same cascade, and it COMMANDS the junior ones
  // instead of merely coexisting. Steeper slope combs the cushions into
  // fall-line streaks; terracettes ride the REAL contours of the form;
  // spurs dry and diverge the comb, hollows converge and darken it. All of
  // it derives from the macro field: gradient direction, gradient
  // magnitude, curvature — never an independent painted-on pattern.
  const T = flags.terrain;
  // Downhill is DOWN the image (+z), like the reference; spur and swale are
  // ridges running down the fall line, so the comb bends around them.
  const macroAt = (x, z) => {
    if (!T) return 0;
    if (T.type === "plane") return -T.slope * z;
    if (T.type === "spur") {
      return -T.slope * z + 0.45 * Math.exp(-((x - 4) ** 2) / (2 * 2.4 ** 2));
    }
    if (T.type === "hollow") {
      return -T.slope * z - 0.45 * Math.exp(-((x - 4) ** 2) / (2 * 2.4 ** 2));
    }
    // composite hillside: the grade itself steepens down the frame
    // (slope 0.1 at the top edge to ~0.7 at the bottom), one spur nose and
    // one drainage swale running down it.
    return -(0.1 * z + 0.025 * z * z) +
      0.4 * Math.exp(-((x - 5) ** 2) / (2 * 2.6 ** 2)) -
      0.4 * Math.exp(-((x - 11.5) ** 2) / (2 * 3.0 ** 2));
  };
  const slopeFrameAt = (x, z) => {
    const eps = 0.05;
    const gx = (macroAt(x + eps, z) - macroAt(x - eps, z)) / (2 * eps);
    const gz = (macroAt(x, z + eps) - macroAt(x, z - eps)) / (2 * eps);
    const slopeMag = Math.hypot(gx, gz);
    const inv = 1 / (slopeMag || 1);
    // Downhill unit vector and the across/along coordinates of the comb.
    const dx = -gx * inv;
    const dz = -gz * inv;
    const across = x * -dz + z * dx;
    const along = x * dx + z * dz;
    const streakiness = smoothstep(0.12, 0.5, slopeMag);
    return { slopeMag, across, along, streakiness, dx, dz };
  };
  // Where the flow direction is ambiguous — a spur's crest, a hollow's
  // axis — grass is NOT combed coherently: the comb dissolves back into
  // tufts. Without this gate the sheared streak field draws wood-grain
  // parabolas around every form.
  const combAt = (x, z, frame) => {
    if (frame.streakiness <= 0) return 0;
    const ahead = slopeFrameAt(x + 0.9, z + 0.4);
    const coherence = smoothstep(0.5, 0.9, frame.dx * ahead.dx + frame.dz * ahead.dz);
    return frame.streakiness * coherence;
  };
  // Round four — the near ring and the hand-over. Near grass is NOT a new
  // technology: it is the same cascade whose finest octaves stop being
  // statistics and resolve into DISCRETE tufts. Tufts crowd the crests of
  // octaves 3-4 and thin out in the creases, so the near grass can never
  // contradict the carpet it stands on — today's live artifact is exactly
  // a blade layer scattered by an INDEPENDENT noise. lod.tuft/lod.grain
  // are the carrier hand-over knobs: 1 where the octave resolves, 0 where
  // it has sunk below the pixel and its energy returns to the band.
  const lod = { tuft: flags.near ? 1 : 0, grain: 1 };
  // A tuft's silhouette is a burst of STEMS, not a dome — domes rendered
  // as dew-drop balls on the first try. So the near octave is a
  // criss-cross of thin ridged stems (two rotated stretched fields,
  // max-combined), CLUSTERED by the crests of cascade octaves 3-4: the
  // same field again, one level further down.
  const stemClusterAt = (x, z) =>
    clamp01((cascadeOctave(x, z, 3) * 0.8 + cascadeOctave(x, z, 4) * 0.6) * 1.2 - 0.1);
  const spikeAt = (x, z) => {
    const a = Math.abs(valueNoise(
      (x * 0.42 - z * 0.91) / 0.012, (x * 0.91 + z * 0.42) / 0.05, 511));
    const b = Math.abs(valueNoise(
      (x * 0.95 + z * 0.31) / 0.05, (x * -0.31 + z * 0.95) / 0.013, 512));
    const stem = Math.max(1 - a, 1 - b);
    return stem * stem;
  };

  const streakAt = (frame) =>
    valueNoise(frame.across / 0.08, frame.along / 1.4, 360) * 0.3 +
    valueNoise(frame.across / 0.14, frame.along / 2.2, 361) * 0.45 +
    valueNoise(frame.across / 0.3, frame.along / 3.5, 362) * 0.35 +
    valueNoise(frame.across / 0.6, frame.along / 5.0, 364) * 0.3;

  const height = (x, z) => {
    // Shared ground: a gentle slope down +z and two kochka octaves. For
    // slope-law tiles the macro form replaces the built-in tilt, and the
    // comb takes energy from the kochki as the grade steepens.
    const frame = T ? slopeFrameAt(x, z) : null;
    const comb = frame ? combAt(x, z, frame) : 0;
    const calm = 1 - comb * 0.5;
    let h = T ? macroAt(x, z) : -z * 0.34;
    h += valueNoise(x / 2.6, z / 2.6, 7) * 0.11 * calm;
    h += valueNoise(x / 1.35, z / 1.35, 24) * 0.05 * calm;

    if (frame) {
      // The comb: streaks stretched along the fall line, their strength a
      // function of the slope and of the direction's coherence.
      h += streakAt(frame) * 0.05 * comb;
      // Terracettes phase-locked to the REAL contours: the band you see is
      // a line of constant macro height, exactly like sheep tracks — and
      // like tracks they come in broken segments, not full rings.
      const terr = smoothstep(0.3, 0.55, frame.slopeMag);
      if (terr > 0) {
        const wander = valueNoise(x / 2.2, z / 2.2, 363) * 0.8;
        const segment = 0.5 + 0.5 * valueNoise(x / 1.1, z / 1.1, 366);
        h += Math.sin((macroAt(x, z) / 0.45) * Math.PI * 2 + wander) * 0.028 * terr * segment;
      }
    }

    if (flags.embossNoise) {
      // Variant B: the old isotropic noise, now treated as height.
      h += valueNoise(x / 0.42, z / 0.42, 63) * 0.028;
      h += valueNoise(x / 0.18, z / 0.18, 91) * 0.012;
    }

    if (flags.wrinkles) {
      // Hummock backs rise, creases dip; one middle octave fills the gap
      // between the metre-scale kochki and the centimetre shag.
      const w = wrinkleAt(x, z);
      h += w.fold * 0.08;
      h -= w.crease * 0.022;
      h += valueNoise(x / 0.8, z / 0.8, 26) * 0.03;
    }

    if (flags.shag) {
      // Round-two shag: milder anisotropy than round one — the x1.7
      // downslope stretch read as corduroy once the cells no longer broke
      // it up. Tufty and near-isotropic, with one gently combed octave.
      h += valueNoise(x / 0.038, z / 0.05, 133) * 0.008;
      h += valueNoise(x / 0.07, z / 0.07, 134) * 0.006;
      h += valueNoise(x / 0.13, z / 0.16, 135) * 0.005;
    }

    if (flags.cascade) {
      // The whole carpet is ONE self-similar cascade. cascadeShort is the
      // negative control: stop it at 40 cm and watch the fur die — the
      // "мохнатость" factor is the cascade continuing past what the eye
      // resolves, not any single octave.
      const octaves = flags.cascadeShort ? 3 : 7;
      // On combed slopes the coarse cushions flatten — the comb takes
      // their energy, it does not merely overlay them.
      const damp = comb * 0.55;
      const fineDamp = comb * 0.35;
      for (let i = 0; i < octaves; i += 1) {
        // The comb also lays the FINE fur down: isotropic speckle dilutes
        // the direction on a steep face, so it yields to the streaks.
        // With masses on, the hummock octaves steepen — the photo's depth
        // lives in their shadow pockets.
        const boost = flags.masses && i >= 1 && i <= 3 ? 1.35 : 1;
        const amplitude = CASCADE[i].amplitude * boost * (i < 3 ? 1 - damp : 1 - fineDamp);
        h += cascadeOctave(x, z, i) * amplitude;
      }
    }

    if (flags.near && lod.tuft > 0) {
      h += spikeAt(x, z) * (0.004 + stemClusterAt(x, z) * 0.008) * lod.tuft;
    }

    if (flags.masses) {
      // Tonal MASSES: one octave ABOVE the kochki — broad rounded swells
      // that group the hummocks into readable lit and shaded families.
      // They compose the frame's values; without them every scale carries
      // equal energy and the frame reads flat, however rich the texture.
      h += Math.abs(valueNoise(x / 6.5, z / 6.5, 601)) * 0.55;
    }

    if (flags.faintCells) {
      // The hybrid: the polster texture survives only as a whisper under
      // the folds — a quarter of the round-one cell signal.
      const cell = cellField(x, z);
      h += Math.pow(clamp01(1 - cell.f1), 1.2) * 0.006;
      h -= smoothstep(0.16, 0.0, cell.f2 - cell.f1) * 0.004 * seamStrength(x, z);
    }

    if (flags.cellRelief) {
      // The cells are an UNDERTONE: a soft organizing wave beneath the shag,
      // not drawn cobbles. The reference keeps them at ~30% of the signal.
      const cell = cellField(x, z);
      const dome = Math.pow(clamp01(1 - cell.f1), 1.2);
      h += dome * 0.014 * (0.75 + cell.owner * 0.5);
      h -= smoothstep(0.16, 0.0, cell.f2 - cell.f1) * 0.008 * seamStrength(x, z);
      const family = familyField(x, z);
      h += Math.pow(clamp01(1 - family.f1), 1.6) * 0.024;
    }

    if (flags.stipple) {
      // The shag is the DOMINANT texture: three octaves of fine relief whose
      // lighting becomes thousands of tiny highlight/shadow pairs — the
      // "запустить руку" signal. Slightly elongated downslope.
      h += valueNoise(x / 0.032, z / 0.055, 133) * 0.011;
      h += valueNoise(x / 0.065, z / 0.1, 134) * 0.008;
      h += valueNoise(x / 0.12, z / 0.19, 135) * 0.006;
    }

    if (flags.stones) {
      const hit = stoneAt(x, z);
      if (hit) {
        const { stone, distance } = hit;
        if (distance < stone.r) {
          // The stone's crown: a LOW battered dome breaking the sod, its
          // surface faceted by coarse noise rather than polished.
          const dome = Math.sqrt(Math.max(0, 1 - (distance / stone.r) ** 2));
          h += dome * stone.r * 0.42;
          h += valueNoise(x / 0.07, z / 0.07, 61) * stone.r * 0.16 * dome;
        } else {
          // The moat: turf dips before it laps back up.
          h -= smoothstep(0.14, 0.0, distance - stone.r) * 0.02;
        }
      }
    }
    return h;
  };

  const albedo = (x, z) => {
    const macro = valueNoise(x / 1.7, z / 1.7, 41);
    const patch = valueNoise(x / 2.9, z / 2.9, 87);
    let color = mix3(GRASS_BASE, GRASS_ALT, 0.5 + 0.5 * macro);
    color = mix3(color, GRASS_LIT, smoothstep(0.18, 0.68, patch) * 0.55);

    if (flags.legacyMottle) {
      // Variant A: brightness mottle straight from the noise — the current
      // live look, honest and unflattered.
      const mottle = valueNoise(x / 0.53, z / 0.53, 63);
      const hollow = smoothstep(0.25, 0.75, -mottle);
      color = mix3(color, SEAM_DARK, hollow * 0.5);
      color = color.map((channel) => channel * (1 + mottle * 0.09));
    }

    if (flags.slavedColor) {
      // Color is a SLAVE of the relief, not an independent mottle: crests
      // dry toward straw-yellow, creases stay wet dark green. Broad mossy
      // patches (metres) shift the hue family — large patches, not noise
      // (bible II.3) — and the camouflage-blob artifact dies because no
      // color transition happens without a relief reason.
      const w = wrinkleAt(x, z);
      const moss = smoothstep(0.05, 0.75, valueNoise(x / 3.6, z / 3.6, 321));
      color = mix3(color, MOSS_YELLOW, moss * 0.45);
      color = mix3(color, GRASS_LIT, smoothstep(0.55, 0.98, w.fold) * 0.3);
      color = mix3(color, SEAM_DARK, w.crease * 0.5);
    }

    if (flags.shag) {
      const grain = valueNoise(x / 0.035, z / 0.045, 133);
      color = color.map((channel) => channel * (1 + grain * 0.05));
    }

    if (flags.cascadeColor) {
      // Color is a slave of the SAME cascade: octave-1/2 crests dry toward
      // straw, the pinched hollows of octave 1 hold the wet dark, mossy
      // patches stay metres wide (bible II.3). No transition without a
      // relief reason — the camouflage blobs cannot come back.
      const crest = clamp01(cascadeOctave(x, z, 1) * 0.75 + cascadeOctave(x, z, 2) * 0.5);
      const moss = smoothstep(0.05, 0.75, valueNoise(x / 3.6, z / 3.6, 321));
      color = mix3(color, MOSS_YELLOW, moss * 0.45);
      color = mix3(color, GRASS_LIT, smoothstep(0.5, 1.0, crest) * 0.3);
      // The hollow-line term is a NEAR-scale signal: at mid-far it re-draws
      // cell outlines around every cushion (the marble artifact), so the
      // slope-law tiles keep only a whisper of it.
      const hollow = Math.pow(1 - clamp01(cascadeOctave(x, z, 1) * 1.7), 2.2);
      color = mix3(color, SEAM_DARK, hollow * (T ? 0.15 : 0.45));

      if (flags.near && lod.tuft > 0) {
        // Dead thatch collects in the deep creases; lit stems dry toward
        // straw where they cluster.
        const dead = smoothstep(0.32, 0.06, cascadeOctave(x, z, 1));
        color = mix3(color, DEAD_THATCH, dead * 0.35 * lod.tuft);
        const stem = spikeAt(x, z) * stemClusterAt(x, z);
        color = mix3(color, STRAW, stem * 0.28 * lod.tuft);
      }

      if (flags.masses) {
        // Albedo follows the masses too: high swells dry warm, their
        // hollows deepen toward a cool damp green.
        const mass = Math.abs(valueNoise(x / 6.5, z / 6.5, 601));
        color = mix3(color, GRASS_LIT, smoothstep(0.25, 0.9, mass) * 0.2);
        color = mix3(color, [0.21, 0.27, 0.19], smoothstep(0.3, 0.02, mass) * 0.25);
      }
    }

    if (T) {
      const frame = slopeFrameAt(x, z);
      const comb = combAt(x, z, frame);
      // Combed grass shows dry stems: brightness streaks + a silvering of
      // the steep face toward straw.
      color = color.map((channel) =>
        channel * (1 + streakAt(frame) * 0.09 * comb));
      color = mix3(color, STRAW, comb * 0.1);
      // Curvature is moisture: drainage hollows wet and darken, spur
      // crests dry and lighten. Both read straight off the macro field.
      const step = 0.6;
      const laplacian =
        macroAt(x + step, z) + macroAt(x - step, z) +
        macroAt(x, z + step) + macroAt(x, z - step) - 4 * macroAt(x, z);
      color = mix3(color, SEAM_DARK, clamp01(laplacian * 5.0) * 0.4);
      color = mix3(color, GRASS_LIT, clamp01(-laplacian * 4.0) * 0.28);
    }

    if (flags.faintCells) {
      const cell = cellField(x, z);
      const cellTint = mix3(GRASS_BASE, GRASS_LIT, clamp01(cell.owner * 1.15 - 0.1));
      color = mix3(color, cellTint, 0.16);
      const seam = smoothstep(0.18, 0.02, cell.f2 - cell.f1) * seamStrength(x, z);
      color = mix3(color, SEAM_DARK, seam * 0.12);
    }

    if (flags.cellAlbedo) {
      const cell = cellField(x, z);
      // Per-polster tint: neighbouring cushions differ visibly, like moss
      // colonies — some yellow, some deep.
      const cellTint = mix3(GRASS_BASE, GRASS_LIT, clamp01(cell.owner * 1.15 - 0.1));
      color = mix3(color, cellTint, 0.42);
      const crown = Math.pow(clamp01(1 - cell.f1), 1.5);
      color = mix3(color, GRASS_LIT, crown * 0.1 * (0.5 + cell.owner * 0.7));
      // The dark seam web, BAKED into albedo so the carpet survives flat
      // overcast light — a soft undertone, broken, never a drawn outline.
      const seam = smoothstep(0.18, 0.02, cell.f2 - cell.f1) * seamStrength(x, z);
      color = mix3(color, SEAM_DARK, seam * 0.32);
      const family = familyField(x, z);
      const familySeam = smoothstep(0.22, 0.04, family.f2 - family.f1);
      color = mix3(color, SEAM_DARK, familySeam * 0.14);
    }

    if (flags.stipple) {
      const grain = valueNoise(x / 0.03, z / 0.085, 133);
      const grain2 = valueNoise(x / 0.05, z / 0.11, 137);
      color = color.map((channel) => channel * (1 + grain * 0.06 + grain2 * 0.04));
    }

    if (flags.stones) {
      const hit = stoneAt(x, z);
      if (hit) {
        const { stone, distance } = hit;
        if (distance < stone.r) {
          const speckle = valueNoise(x / 0.05, z / 0.05, 171);
          let rock = mix3(STONE_MID, STONE_LICHEN, smoothstep(0.05, 0.6, speckle));
          rock = rock.map((channel) => channel * (0.92 + hash2(stone.x * 31, stone.z * 17, 3) * 0.16));
          color = rock;
        } else {
          // The dark moat ring where sod meets rock.
          const moat = smoothstep(0.12, 0.01, distance - stone.r);
          color = mix3(color, [0.13, 0.15, 0.09], moat * 0.55);
        }
      }
    }
    return color;
  };

  return { height, albedo, foldAt, lod };
}

function renderVariant(flags) {
  const { height, albedo, foldAt, lod } = makeField(flags);
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  // Mid-far tiles cover more metres per pixel; the normal probe widens
  // with the footprint so sub-pixel octaves average out instead of
  // aliasing — the honest hand-over of fine octaves into statistics.
  const scale = flags.patchScale ?? 1;
  let epsilon = 0.006 * scale;

  // The recession view: one gaze across the ground, near at the bottom of
  // the frame (1.6 mm/px) receding to far at the top (26 mm/px). Every
  // octave hands its carrier over at ITS OWN row — tufts sink back into
  // the band, grain into tint — so no row anywhere holds a seam.
  let recessionRows = null;
  if (flags.recession) {
    recessionRows = [];
    let zWorld = 0;
    for (let i = 0; i < HEIGHT; i += 1) {
      const t = i / (HEIGHT - 1);
      const footprint = 0.0016 * Math.exp(Math.log(0.026 / 0.0016) * t);
      recessionRows.push({ zWorld, footprint });
      zWorld += footprint;
    }
  }

  for (let py = 0; py < HEIGHT; py += 1) {
    let z = (py / HEIGHT) * PATCH_H * scale;
    let footprint = 0;
    if (recessionRows) {
      const row = recessionRows[HEIGHT - 1 - py];
      z = row.zWorld;
      footprint = row.footprint;
      lod.tuft = 1 - smoothstep(0.003, 0.007, footprint);
      lod.grain = 1 - smoothstep(0.006, 0.02, footprint);
      epsilon = Math.max(0.006, footprint * 2.4);
    }
    for (let px = 0; px < WIDTH; px += 1) {
      // Recession keeps a CONSTANT horizontal scale (telephoto grazing
      // view): only the depth compresses with distance. A true perspective
      // fan smeared every feature into radial zoom streaks.
      const x = recessionRows
        ? (px - WIDTH / 2) * 0.005
        : (px / WIDTH) * PATCH_W * scale;

      const h = height(x, z);
      const hx = height(x + epsilon, z) - height(x - epsilon, z);
      const hz = height(x, z + epsilon) - height(x, z - epsilon);
      const normal = normalize3([-hx / (2 * epsilon), 1, -hz / (2 * epsilon)]);

      // Soft concavity AO: the pit is darker than the crown, sun or no sun.
      const around = (
        height(x + 0.11, z) + height(x - 0.11, z) +
        height(x, z + 0.11) + height(x, z - 0.11)
      ) / 4;
      const occlusion = 1 - smoothstep(0.0, 0.05, around - h) * 0.55;

      const sun = flags.terrain ? SUN_SLOPE : SUN;
      const rawNdl = normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2];
      const lambert = Math.max(0, rawNdl);
      const color = albedo(x, z);
      const offset = (py * WIDTH + px) * 3;
      if (flags.pile) {
        // Pile optics: the light behaves as if it fell into fabric.
        // Wrap diffuse — the pile is translucent, so the terminator never
        // snaps; depth comes from a DEEP two-ring AO instead, which is why
        // the creases still go nearly black like the reference.
        const wrapped = clamp01((rawNdl + 0.18) / 1.18);
        const around2 = (
          height(x + 0.22, z) + height(x - 0.22, z) +
          height(x, z + 0.22) + height(x, z - 0.22)
        ) / 4;
        const deepOcclusion = Math.max(
          0.1,
          1 - smoothstep(0, 0.04, around - h) * 0.5 - smoothstep(0, 0.1, around2 - h) * 0.45,
        );
        // Crest sheen: sun-facing hummock backs catch a pale straw gleam —
        // the lit tips of the pile, not a specular dot.
        const fold = foldAt(x, z);
        const sheen = smoothstep(0.78, 1.0, wrapped) * smoothstep(0.5, 0.95, fold) * 0.18;
        // Sparkle rides irradiance: lit zones glitter with tip highlights,
        // shadowed creases go matte — fabric's signature.
        const sparkle = 1 + (
          valueNoise(x / 0.035, z / 0.045, 233) * 0.09 +
          valueNoise(x / 0.06, z / 0.08, 234) * 0.06
        ) * (0.3 + 0.7 * wrapped) * (0.3 + 0.7 * lod.grain);
        const sunColor = flags.warmCool ? SUN_WARM : SUN_COLOR;
        const skyColor = flags.warmCool ? SKY_COOL : SKY_COLOR;
        for (let channel = 0; channel < 3; channel += 1) {
          let lit = color[channel] * (
            sunColor[channel] * wrapped * 1.1 +
            skyColor[channel] * 0.5 * deepOcclusion
          );
          lit = lit * (1 - sheen) + STRAW[channel] * sheen * (0.8 + 0.4 * wrapped);
          lit *= sparkle;
          if (flags.aerial) {
            // A whiff of aerial perspective inside the frame: the upslope
            // top third lifts and cools toward haze.
            const depth = smoothstep(0.5, 1, 1 - py / HEIGHT);
            lit += (HAZE[channel] - lit) * 0.14 * depth;
          }
          pixels[offset + channel] = Math.round(clamp01(lit / (1 + lit * 0.18)) * 255);
        }
      } else {
        for (let channel = 0; channel < 3; channel += 1) {
          const lit = color[channel] * (
            SUN_COLOR[channel] * lambert * 0.95 +
            SKY_COLOR[channel] * 0.62 * occlusion
          );
          // Gentle filmic-ish roll-off instead of a hard clip.
          pixels[offset + channel] = Math.round(clamp01(lit / (1 + lit * 0.18)) * 255);
        }
      }
    }
  }
  return pixels;
}

/**
 * The SEA rounds (Igor, 21.08): the ocean is the cascade's fourth profile.
 * From Kallur's cliff heights waves are a MOVING PATTERN on a surface, not
 * displaced geometry: long swell octaves elongated along their crests,
 * chop, glitter statistics by the sun, whitecaps on crests, haze eating
 * the horizon. Palettes measured from reference-05 (sunny) and
 * reference-10 (sunset golden path).
 */
const SEA_DEEP_DAY = hex("#3e6489");
const SEA_LIGHT_DAY = hex("#7a97a9");
const SEA_HAZE_DAY = hex("#e0e4e6");
const SKY_DAY_HORIZON = hex("#e7e8e8");
const SKY_DAY_UP = hex("#b0c4d4");
const SEA_DEEP_DUSK = hex("#232735");
const SEA_LIGHT_DUSK = hex("#3a4351");
const SEA_HAZE_DUSK = hex("#8a7360");
const SKY_DUSK_HORIZON = hex("#f0b273");
const SKY_DUSK_UP = hex("#494f51");
const SUN_PATH_GOLD = hex("#f9b061");

/** Swell height: plain (not billowed) octaves elongated ALONG their crests. */
function seaHeight(x, z, phase) {
  // Travel toward -z (to the island behind the camera); crests along x.
  let height = 0;
  height += Math.sin((z + phase * 14) / 90 * Math.PI * 2 +
    valueNoise(x / 260, z / 90, 601) * 2.2) * 0.85;
  height += Math.sin((z * 0.94 + x * 0.34 + phase * 9) / 46 * Math.PI * 2 +
    valueNoise(x / 150, z / 60, 602) * 2.0) * 0.45;
  height += valueNoise((x * 0.97 + z * 0.26) / 70, (z * 0.97 - x * 0.26) / 15, 603) * 0.3;
  height += valueNoise(x / 6.5, (z + phase * 4) / 5.2, 604) * 0.2;
  height += valueNoise(x / 2.1, z / 1.8, 605) * 0.11;
  height += valueNoise(x / 0.8, z / 0.7, 606) * 0.055;
  return height;
}

function renderSeaVariant(flags) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const dusk = Boolean(flags.dusk);
  const eyeHeight = 62;
  const horizonRow = Math.floor(HEIGHT * 0.24);
  const sunAzimuthX = dusk ? 0 : -0.55;
  const sunDir = dusk
    ? normalize3([0, 0.045, 1])
    : normalize3([-0.55, 0.62, 0.62]);
  const deep = dusk ? SEA_DEEP_DUSK : SEA_DEEP_DAY;
  const light = dusk ? SEA_LIGHT_DUSK : SEA_LIGHT_DAY;
  const hazeColor = dusk ? SEA_HAZE_DUSK : SEA_HAZE_DAY;
  const skyHorizon = dusk ? SKY_DUSK_HORIZON : SKY_DAY_HORIZON;
  const skyUp = dusk ? SKY_DUSK_UP : SKY_DAY_UP;

  for (let py = 0; py < HEIGHT; py += 1) {
    for (let px = 0; px < WIDTH; px += 1) {
      const offset = (py * WIDTH + px) * 3;
      const screenX = (px / WIDTH - 0.5) * 1.15;
      if (py <= horizonRow) {
        // Sky: vertical gradient plus the low-sun glow at dusk.
        const up = (horizonRow - py) / horizonRow;
        let sky = mix3(skyHorizon, skyUp, Math.pow(up, 0.72));
        if (dusk) {
          const toSun = Math.hypot(screenX - sunAzimuthX, up * 0.62);
          sky = mix3(sky, SUN_PATH_GOLD, Math.max(0, 1 - toSun * 2.6) * 0.85);
        }
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[offset + channel] = Math.round(clamp01(sky[channel]) * 255);
        }
        continue;
      }
      // Sea: rows map to distance, telephoto-style, out to the horizon.
      const below = (py - horizonRow) / (HEIGHT - horizonRow);
      const distance = 24 * Math.exp((1 - below) * 4.6);
      const x = screenX * distance;
      const z = distance;
      const grazing = Math.atan2(eyeHeight, distance);
      const footAcross = distance * 0.0012;
      const footAlong = footAcross / Math.max(0.05, Math.sin(grazing));
      const fadeFine = 1 - smoothstep(2.2, 9, footAlong);
      const epsilon = Math.max(0.12, footAlong * 0.5);
      const h0 = seaHeight(x, z, 0.35);
      const hx = seaHeight(x + epsilon, z, 0.35) - seaHeight(x - epsilon, z, 0.35);
      const hz = seaHeight(x, z + epsilon, 0.35) - seaHeight(x, z - epsilon, 0.35);
      const normal = normalize3([
        -hx / (2 * epsilon) * (0.6 + 0.4 * fadeFine),
        1,
        -hz / (2 * epsilon) * (0.6 + 0.4 * fadeFine),
      ]);
      const view = normalize3([-x, eyeHeight, -z]);
      const cosView = Math.max(0.02, normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2]);
      const fresnel = 0.02 + 0.98 * Math.pow(1 - cosView, 5);
      // Water body: deep toward the camera, lighter where the swell face
      // tilts toward the light.
      const faceLight = clamp01(0.5 + (normal[2] * (dusk ? 0.9 : 0.4) + normal[0] * sunAzimuthX) * 2.2);
      let water = mix3(deep, light, faceLight * 0.55);
      // Sky reflection by fresnel.
      water = mix3(water, skyHorizon, clamp01(fresnel) * 0.82);
      // Sun glint: reflect the view about the normal; the exponent falls
      // with footprint so the far glitter widens into the path.
      const reflect = [
        view[0] - 2 * cosView * normal[0],
        view[1] - 2 * cosView * normal[1],
        view[2] - 2 * cosView * normal[2],
      ];
      const toSun = Math.max(0,
        -reflect[0] * sunDir[0] - reflect[1] * sunDir[1] - reflect[2] * sunDir[2]);
      const glossExponent = 70 + 480 * fadeFine;
      const glint = Math.pow(toSun, glossExponent) * (dusk ? 2.6 : 2.2);
      const glintColor = dusk ? SUN_PATH_GOLD : [1, 1, 0.96];
      water = [
        water[0] + glintColor[0] * glint,
        water[1] + glintColor[1] * glint,
        water[2] + glintColor[2] * glint,
      ];
      // Whitecaps: crests of the second swell octave sharpened, dying with
      // distance like every octave (windy Faroe day; calm at dusk).
      if (!dusk) {
        const crest = seaHeight(x, z, 0.35) - seaHeight(x, z + 2.6, 0.35);
        const caps = smoothstep(0.5, 0.85, crest) *
          smoothstep(0.42, 0.8, valueNoise(x / 9, z / 7, 611)) * fadeFine;
        water = mix3(water, [0.94, 0.96, 0.97], clamp01(caps) * 0.8);
      }
      // Aerial haze: the sea dissolves into the horizon, never a hard line.
      const haze = smoothstep(180, 2100, distance);
      water = mix3(water, mix3(hazeColor, skyHorizon, 0.55), haze * 0.92);
      for (let channel = 0; channel < 3; channel += 1) {
        const lit = water[channel];
        pixels[offset + channel] = Math.round(clamp01(lit / (1 + lit * 0.12)) * 255);
      }
    }
  }
  return pixels;
}

const VARIANTS = [
  {
    id: "a-today-mottle",
    label: "A  today: value-noise mottle (live)",
    flags: { legacyMottle: true },
  },
  {
    id: "b-emboss-noise",
    label: "B  emboss: noise as lit height + AO",
    flags: { embossNoise: true },
  },
  {
    id: "c-cells-albedo",
    label: "C  polster cells: albedo web only",
    flags: { cellAlbedo: true },
  },
  {
    id: "d-cells-relief",
    label: "D  cells + relief + AO",
    flags: { cellAlbedo: true, cellRelief: true },
  },
  {
    id: "e-full-carpet",
    label: "E  full carpet: + anisotropy + grain",
    flags: { cellAlbedo: true, cellRelief: true, anisotropy: true, stipple: true },
  },
  {
    id: "f-carpet-stones",
    label: "F  carpet + bedded stones",
    flags: { cellAlbedo: true, cellRelief: true, anisotropy: true, stipple: true, stones: true },
  },
  {
    id: "g-wrinkle-relief",
    label: "G  wrinkles: blanket folds, no cells",
    flags: { wrinkles: true, shag: true },
  },
  {
    id: "h-wrinkle-color",
    label: "H  + color slaved to relief",
    flags: { wrinkles: true, shag: true, slavedColor: true },
  },
  {
    id: "i-wrinkle-pile",
    label: "I  + pile optics: wrap light, sheen, sparkle",
    flags: { wrinkles: true, shag: true, slavedColor: true, pile: true },
  },
  {
    id: "j-wrinkle-stones",
    label: "J  folds + pile + bedded stones",
    flags: { wrinkles: true, shag: true, slavedColor: true, pile: true, stones: true },
  },
  {
    id: "k-hybrid-cells",
    label: "K  I + faint cell undertone (hybrid)",
    flags: { wrinkles: true, shag: true, slavedColor: true, pile: true, faintCells: true },
  },
  {
    id: "l-cascade-relief",
    label: "L  cascade: hill-in-hill self-similar relief",
    flags: { cascade: true },
  },
  {
    id: "m-cascade-color",
    label: "M  + color slaved to the cascade",
    flags: { cascade: true, cascadeColor: true },
  },
  {
    id: "n-cascade-pile",
    label: "N  + pile optics: wrap, deep AO, sheen, sparkle",
    flags: { cascade: true, cascadeColor: true, pile: true },
  },
  {
    id: "o-cascade-stones",
    label: "O  cascade + pile + bedded stones",
    flags: { cascade: true, cascadeColor: true, pile: true, stones: true },
  },
  {
    id: "p-cascade-cut",
    label: "P  control: cascade STOPPED at 40 cm",
    flags: { cascade: true, cascadeShort: true, cascadeColor: true, pile: true },
  },
  {
    id: "q-slope-flat",
    label: "Q  slope law: 5 deg — cushions stay round",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 2,
      terrain: { type: "plane", slope: 0.09 } },
  },
  {
    id: "r-slope-20",
    label: "R  20 deg — the comb appears down the fall line",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 2,
      terrain: { type: "plane", slope: 0.36 } },
  },
  {
    id: "s-slope-35",
    label: "S  35 deg — streaks + sheep-track terracettes",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 2,
      terrain: { type: "plane", slope: 0.7 } },
  },
  {
    id: "t-slope-spur",
    label: "T  spur nose — comb diverges, crest dries",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 2,
      terrain: { type: "spur", slope: 0.42 } },
  },
  {
    id: "u-slope-hollow",
    label: "U  hollow — comb converges, drainage darkens",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 2,
      terrain: { type: "hollow", slope: 0.42 } },
  },
  {
    id: "v-slope-composite",
    label: "V  one hillside: flat into steep, spur + swale",
    flags: { cascade: true, cascadeColor: true, pile: true, patchScale: 4,
      terrain: { type: "composite" } },
  },
  {
    id: "w-near-tufts",
    label: "W  near ring: tufts ride the SAME cascade",
    flags: { cascade: true, cascadeColor: true, pile: true, near: true, patchScale: 0.5 },
  },
  {
    id: "x-recession",
    label: "X  one gaze near to far — octaves hand over, no seam",
    flags: { cascade: true, cascadeColor: true, pile: true, near: true, recession: true },
  },
  {
    id: "y-mid-frame",
    label: "Y  mid ring vs the photo: masses, warm sun / cool shade, haze",
    flags: { cascade: true, cascadeColor: true, pile: true, masses: true,
      warmCool: true, aerial: true, patchScale: 3,
      terrain: { type: "plane", slope: 0.22 } },
  },
  {
    id: "s1-sea-day",
    label: "S1  sea, sunny day vs reference-05: swell, glitter, whitecaps",
    flags: { seaView: true },
  },
  {
    id: "s2-sea-sunset",
    label: "S2  sea at sunset vs reference-10: ink water, golden path",
    flags: { seaView: true, dusk: true },
  },
];

await mkdir(outputRoot, { recursive: true });
// Optional argv filter: `node kallur-carpet-lab.mjs g-wrinkle-relief ...`
// renders only the named tiles; the contact sheets still compose from disk.
const only = process.argv.slice(2);
for (const variant of VARIANTS) {
  if (only.length > 0 && !only.includes(variant.id)) continue;
  const pixels = variant.flags.seaView
    ? renderSeaVariant(variant.flags)
    : renderVariant(variant.flags);
  const labelSvg = Buffer.from(
    `<svg width="${WIDTH}" height="64"><rect width="100%" height="100%" fill="rgb(20,24,22)" opacity="0.82"/><text x="18" y="42" font-family="monospace" font-size="30" fill="#e8e9e4">${variant.label}</text></svg>`,
  );
  const destination = join(outputRoot, `${variant.id}.png`);
  await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .composite([{ input: labelSvg, top: 0, left: 0 }])
    .png()
    .toFile(destination);
  process.stdout.write(`rendered ${destination}\n`);
}

async function composeSheet(fileName, ids) {
  const rows = Math.ceil(ids.length / 2);
  const sheet = await sharp({
    create: {
      width: WIDTH * 2 + 24,
      height: HEIGHT * rows + (rows - 1) * 24,
      channels: 3,
      background: { r: 14, g: 16, b: 15 },
    },
  })
    .composite(ids.map((id, index) => ({
      input: join(outputRoot, `${id}.png`),
      left: (index % 2) * (WIDTH + 24),
      top: Math.floor(index / 2) * (HEIGHT + 24),
    })))
    .png()
    .toFile(join(outputRoot, fileName));
  process.stdout.write(`rendered ${join(outputRoot, fileName)} (${sheet.width}x${sheet.height})\n`);
}

// Sheet one: the first round (cells). Sheet two: the fold round, with E kept
// in the corner as the direct comparison against the craquelure direction.
await composeSheet("contact-sheet.png", [
  "a-today-mottle", "b-emboss-noise", "c-cells-albedo",
  "d-cells-relief", "e-full-carpet", "f-carpet-stones",
]);
await composeSheet("contact-sheet-2.png", [
  "l-cascade-relief", "m-cascade-color", "n-cascade-pile",
  "p-cascade-cut", "o-cascade-stones", "e-full-carpet",
]);
await composeSheet("contact-sheet-3.png", [
  "q-slope-flat", "r-slope-20", "s-slope-35",
  "t-slope-spur", "u-slope-hollow", "v-slope-composite",
]);
await composeSheet("contact-sheet-4.png", [
  "w-near-tufts", "x-recession", "y-mid-frame", "n-cascade-pile",
]);
