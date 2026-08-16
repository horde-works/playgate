#!/usr/bin/env node
/**
 * Measure the seam and rivet lattice of a riveted metal skin from a
 * photograph, and the optical contrast that lattice carries.
 *
 * This is the detector behind `games/make-a-mess/docs/dc-3/skin-seam-passport-p01.md`.
 * It answers three questions, all of them in pixels — the passport, not this
 * script, owns the conversion to metres:
 *
 *   period  — what spatial periods live in a window (autocorrelation of the
 *             row/column mean profile, slow illumination removed first);
 *   fold    — the average cross-section of one period, as a percentage of the
 *             local mean: a rivet's bright head and its shadow, or a lap
 *             joint's bright lip and dark step;
 *   relief  — how much texture a RENDERED frame still carries in a window:
 *             RMS of the high-passed luminance as a percentage of the local
 *             mean, plus the surviving periods. This is the acceptance number
 *             for the far distance, where the question is not «what pitch» but
 *             «осталась ли вообще фактура или это ровный сатин»;
 *   quilt   — how far apart in tone neighbouring panel cells sit, measured as
 *             the step between adjacent cells rather than as global spread, so
 *             a reflection gradient across the fuselage is not counted as
 *             panel scatter.
 *
 * Usage:
 *   node scripts/measure-skin-seams.mjs period <image> <x> <y> <w> <h>
 *   node scripts/measure-skin-seams.mjs fold   <image> <x> <y> <w> <h> <axis> [pitch]
 *   node scripts/measure-skin-seams.mjs quilt  <image> <x> <y> <w> <h> <cellX> <cellY>
 *   node scripts/measure-skin-seams.mjs relief <image> <x> <y> <w> <h> [radius]
 *
 * `axis` is `x` or `y` — the axis the period runs along. With no `pitch` the
 * fold searches for the pitch that maximises folded amplitude.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"));
const sharp = require("sharp");

const [mode, file, ...rest] = process.argv.slice(2);
const [x, y, w, h] = rest.slice(0, 4).map(Number);

async function greyscale() {
  const { data, info } = await sharp(file)
    .extract({ left: x, top: y, width: w, height: h })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Float64Array.from(data), width: info.width, height: info.height };
}

/** Subtract a moving average: the panel keeps its ripple, the lighting goes. */
function highPass(signal, radius) {
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const j = i + k;
      if (j < 0 || j >= signal.length) continue;
      sum += signal[j];
      count += 1;
    }
    out[i] = signal[i] - sum / count;
  }
  return out;
}

function meanProfile({ data, width, height }, axis) {
  const span = axis === "x" ? width : height;
  const other = axis === "x" ? height : width;
  const profile = new Float64Array(span);
  for (let i = 0; i < span; i += 1) {
    let sum = 0;
    for (let j = 0; j < other; j += 1) {
      sum += axis === "x" ? data[j * width + i] : data[i * width + j];
    }
    profile[i] = sum / other;
  }
  return profile;
}

function autocorrelationPeaks(signal, minLag) {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const centred = Array.from(signal, (v) => v - mean);
  const zero = centred.reduce((a, v) => a + v * v, 0);
  const values = [];
  const maxLag = Math.floor(signal.length / 3);
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < centred.length; i += 1) sum += centred[i] * centred[i + lag];
    values.push(sum / zero);
  }
  const found = [];
  for (let i = 1; i < values.length - 1; i += 1) {
    const lag = i + 1;
    if (lag < minLag) continue;
    if (values[i] <= values[i - 1] || values[i] < values[i + 1] || values[i] <= 0) continue;
    const denom = values[i - 1] - 2 * values[i] + values[i + 1];
    const shift = denom === 0 ? 0 : (0.5 * (values[i - 1] - values[i + 1])) / denom;
    found.push({ lag: lag + shift, value: values[i] });
  }
  return found.sort((a, b) => b.value - a.value).slice(0, 6);
}

if (mode === "relief") {
  // Фактура кадра = мелкая рябь, оставшаяся после снятия освещения. Радиус
  // высокочастотного фильтра берётся в пикселях: всё крупнее него считается
  // формой и светом, а не фактурой поверхности.
  const radius = Number(rest[4] ?? 6);
  const image = await greyscale();
  const mean = image.data.reduce((a, b) => a + b, 0) / image.data.length;
  let sumOfSquares = 0;
  for (let row = 0; row < image.height; row += 1) {
    const line = image.data.subarray(row * image.width, (row + 1) * image.width);
    const detail = highPass(line, radius);
    for (const value of detail) sumOfSquares += value * value;
  }
  const rms = Math.sqrt(sumOfSquares / image.data.length);
  console.log(`# ${file} [${x},${y} ${w}x${h}] radius=${radius}`);
  console.log(`mean luminance: ${mean.toFixed(1)}`);
  console.log(`relief RMS: ${(rms / mean * 100).toFixed(2)}% of mean`);
  const peaks = autocorrelationPeaks(highPass(meanProfile(image, "x"), 24), 3);
  console.log(
    `surviving periods along X: ${
      peaks.length
        ? peaks.map((p) => `${p.lag.toFixed(2)}px r=${p.value.toFixed(3)}`).join("  ")
        : "none"
    }`,
  );
} else if (mode === "period") {
  const image = await greyscale();
  console.log(`# ${file} [${x},${y} ${w}x${h}]`);
  for (const axis of ["x", "y"]) {
    const peaks = autocorrelationPeaks(highPass(meanProfile(image, axis), 24), 4);
    const label = axis === "x" ? "along X (circumferential lines)" : "along Y (longitudinal lines)";
    console.log(`${label}: ${peaks.map((p) => `${p.lag.toFixed(2)}px r=${p.value.toFixed(3)}`).join("  ")}`);
  }
} else if (mode === "fold") {
  const axis = rest[4];
  const given = rest[5] === undefined ? null : Number(rest[5]);
  const image = await greyscale();
  const profile = meanProfile(image, axis);
  const detrended = highPass(profile, 20);
  const base = profile.reduce((a, b) => a + b, 0) / profile.length;
  const BINS = 48;
  const foldAt = (pitch) => {
    const bins = new Float64Array(BINS);
    const counts = new Float64Array(BINS);
    for (let i = 0; i < profile.length; i += 1) {
      const bin = Math.floor(((i % pitch) / pitch) * BINS);
      bins[bin] += detrended[i];
      counts[bin] += 1;
    }
    for (let b = 0; b < BINS; b += 1) bins[b] /= counts[b] || 1;
    return bins;
  };
  let pitch = given;
  if (pitch === null) {
    let best = -Infinity;
    for (let candidate = 4; candidate <= profile.length / 4; candidate += 0.01) {
      const bins = foldAt(candidate);
      const amplitude = Math.max(...bins) - Math.min(...bins);
      if (amplitude > best) {
        best = amplitude;
        pitch = candidate;
      }
    }
  }
  const bins = foldAt(pitch);
  let peak = 0;
  for (let b = 1; b < BINS; b += 1) if (bins[b] > bins[peak]) peak = b;
  const rotated = Array.from(
    { length: BINS },
    (_, b) => bins[(b + peak - BINS / 2 + BINS) % BINS],
  );
  const crest = Math.max(...rotated);
  const trough = Math.min(...rotated);
  const half = trough + (crest - trough) / 2;
  let left = BINS / 2;
  while (left > 0 && rotated[left] > half) left -= 1;
  let right = BINS / 2;
  while (right < BINS - 1 && rotated[right] > half) right += 1;
  console.log(`# ${file} [${x},${y} ${w}x${h}] axis=${axis}`);
  console.log(`pitch ${pitch.toFixed(2)}px   local mean grey ${base.toFixed(1)}`);
  console.log(
    `crest +${(100 * crest / base).toFixed(1)}%   trough ${(100 * trough / base).toFixed(1)}%   ` +
      `crest width ${(((right - left) / BINS) * pitch).toFixed(2)}px ` +
      `(${(100 * (right - left) / BINS).toFixed(0)}% of pitch)`,
  );
  console.log("cross-section %: " + rotated.map((v) => (100 * v / base).toFixed(1)).join(" "));
} else if (mode === "quilt") {
  const cellX = Number(rest[4]);
  const cellY = Number(rest[5]);
  const { data, width, height } = await greyscale();
  const columns = Math.floor(width / cellX);
  const rows = Math.floor(height / cellY);
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    cells.push([]);
    for (let column = 0; column < columns; column += 1) {
      let sum = 0;
      let count = 0;
      // Inset by a quarter cell so seam pixels and rivets stay out of the mean.
      for (let py = Math.round((row + 0.25) * cellY); py < Math.round((row + 0.75) * cellY); py += 1) {
        for (let px = Math.round((column + 0.25) * cellX); px < Math.round((column + 0.75) * cellX); px += 1) {
          sum += data[py * width + px];
          count += 1;
        }
      }
      cells[row].push(sum / count);
    }
  }
  const step = (a, b) => Math.abs(a - b) / ((a + b) / 2);
  const across = [];
  const along = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column + 1 < columns; column += 1) {
      across.push(step(cells[row][column], cells[row][column + 1]));
    }
  }
  for (let row = 0; row + 1 < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      along.push(step(cells[row][column], cells[row + 1][column]));
    }
  }
  const quantile = (list, q) => {
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * q)];
  };
  console.log(`# ${file} [${x},${y} ${w}x${h}] cell ${cellX}x${cellY}px  cells ${rows * columns}`);
  console.log(
    `step across a circumferential seam: median ${(100 * quantile(across, 0.5)).toFixed(1)}% ` +
      `p90 ${(100 * quantile(across, 0.9)).toFixed(1)}%`,
  );
  console.log(
    `step across a longitudinal seam:    median ${(100 * quantile(along, 0.5)).toFixed(1)}% ` +
      `p90 ${(100 * quantile(along, 0.9)).toFixed(1)}%`,
  );
} else {
  console.error("modes: period | fold | quilt");
  process.exit(1);
}
