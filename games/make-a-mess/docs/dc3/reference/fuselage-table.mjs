/**
 * Сборка таблицы станций фюзеляжа — КАЖДАЯ КОЛОНКА СО СВОЕЙ ПАНЕЛИ.
 *
 * Ровно здесь была допущена ошибка ревизии c4: колонки верха и низа сняты с
 * боковой панели, полуширина — с плановой, и при сборке руками строки сошлись
 * не по станции. Теперь каждая колонка интерполируется на общую сетку из
 * СВОИХ измерений, а участки, где трасса села на чужую деталь, объявлены
 * явными окнами и заполняются интерполяцией между чистыми краями.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url).pathname;
const trace = JSON.parse(readFileSync(`${here}trace.json`, "utf8"));
const { data, info } = await sharp(`${here}c47-3view.png`).greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const dark = (x, y) => data[y * W + x] < 128;
const P = trace.panels.plan;
const S = trace.panels.side;

const LENGTH = 19.66;
const SPAN = 28.956;
const K_PLAN_FS = LENGTH / (P.xMax - P.xMin);
const K_PLAN_BL = SPAN / (P.yMax - P.yMin);
const K_SIDE = LENGTH / 1211;
const axis = (P.yMin + P.yMax) / 2;
const THETA = Math.atan(0.169670);
const noseX = S.xMin;
const noseY = 1483.5;
const toAircraft = (x, y) => {
  const dx = x - noseX; const dy = y - noseY;
  const c = Math.cos(THETA); const s = Math.sin(THETA);
  return { fs: (dx * c + dy * s) * K_SIDE, wl: -(dy * c - dx * s) * K_SIDE };
};
const runsCol = (x, panel, y0 = panel.yMin, y1 = panel.yMax) => {
  const out = []; let start = -1;
  for (let y = y0; y <= y1 + 1; y += 1) {
    const on = y <= y1 && dark(x, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  return out;
};

// ------------------------------------------------- сырые колонки
const topRaw = []; const bottomRaw = [];
for (let x = S.xMin; x <= S.xMax; x += 2) {
  const runs = runsCol(x, S);
  if (!runs.length) continue;
  const top = toAircraft(x, runs[0][0]);
  topRaw.push([top.fs, top.wl]);
  const last = runs[runs.length - 1];
  const isGround = last[1] >= S.yMax - 6 && last[1] - last[0] <= 6;
  const y = isGround ? (runs.length > 1 ? runs[runs.length - 2][1] : last[1]) : last[1];
  const bottom = toAircraft(x, y);
  bottomRaw.push([bottom.fs, bottom.wl]);
}
const halfRaw = [];
for (let d = 0; d <= P.xMax - P.xMin; d += 3) {
  const x = P.xMax - d;
  const runs = runsCol(x, P, Math.round(axis - 130), Math.round(axis + 130));
  if (!runs.length) continue;
  const half = ((axis - runs[0][0]) + (runs[runs.length - 1][1] - axis)) / 2;
  halfRaw.push([d * K_PLAN_FS, half * K_PLAN_BL]);
}

/** Окна, где трасса села на чужую деталь: их значения выбрасываются. */
const REJECT = {
  top: [[2.95, 3.60], [13.10, 20.0]],           // мачта антенны; форкиль и киль
  bottom: [[1.55, 1.72], [2.55, 12.60], [16.60, 18.10]], // лопасть винта; гондола, зализ, шасси; хвостовое колесо
  half: [[2.72, 3.20], [7.20, 11.20], [15.90, 19.10]],   // диск винта; зализ крыла; стабилизатор
};
const clean = (rows, windows) => rows.filter(([fs]) => !windows.some(([a, b]) => fs >= a && fs <= b))
  .sort((a, b) => a[0] - b[0]);
const sample = (rows, fs) => {
  if (fs <= rows[0][0]) return rows[0][1];
  if (fs >= rows[rows.length - 1][0]) return rows[rows.length - 1][1];
  let index = 0;
  while (index < rows.length - 2 && rows[index + 1][0] < fs) index += 1;
  const [fa, va] = rows[index]; const [fb, vb] = rows[index + 1];
  return va + (vb - va) * (fs - fa) / (fb - fa);
};
const topClean = clean(topRaw, REJECT.top);
const bottomClean = clean(bottomRaw, REJECT.bottom);
const halfClean = clean(halfRaw, REJECT.half);

/**
 * Хвост: киль и стабилизатор закрывают фюзеляж на всех трёх панелях, поэтому
 * сужение конуса авторское — оно объявлено, а не выдано за обмер.
 */
const TAIL_AUTHORED = [
  { fs: 13.20, top: 1.520, bottom: -0.960, half: 1.150 },
  { fs: 14.40, top: 1.470, bottom: -0.880, half: 1.045 },
  { fs: 15.60, top: 1.395, bottom: -0.720, half: 0.930 },
  { fs: 16.60, top: 1.300, bottom: -0.545, half: 0.820 },
  { fs: 17.60, top: 1.170, bottom: -0.330, half: 0.660 },
  { fs: 18.60, top: 1.010, bottom: -0.120, half: 0.450 },
  { fs: 19.30, top: 0.900, bottom: 0.060, half: 0.230 },
  { fs: 19.55, top: 0.840, bottom: 0.140, half: 0.120 },
];
const authoredAt = (fs, key) => {
  if (fs <= TAIL_AUTHORED[0].fs) return null;
  let index = 0;
  while (index < TAIL_AUTHORED.length - 2 && TAIL_AUTHORED[index + 1].fs < fs) index += 1;
  const a = TAIL_AUTHORED[index]; const b = TAIL_AUTHORED[index + 1];
  return a[key] + (b[key] - a[key]) * (fs - a.fs) / (b.fs - a.fs);
};

const GRID = [
  0, 0.10, 0.22, 0.36, 0.52, 0.70, 0.90, 1.06, 1.171, 1.34, 1.50, 1.62, 1.78,
  1.90, 2.10, 2.35, 2.62, 2.90, 3.25, 3.70, 4.20, 4.80, 5.50, 6.30, 7.20, 8.10,
  9.00, 9.90, 10.80, 11.70, 12.50, 13.20, 14.40, 15.60, 16.60, 17.60, 18.60, 19.30, 19.55,
];

const rows = GRID.map((fs) => {
  const tail = authoredAt(fs, "top");
  return {
    fs,
    half: fs === 0 ? 0.020 : (authoredAt(fs, "half") ?? sample(halfClean, fs)),
    top: fs === 0 ? 0.020 : (tail ?? sample(topClean, fs)),
    bottom: fs === 0 ? -0.020 : (authoredAt(fs, "bottom") ?? sample(bottomClean, fs)),
  };
});

console.log("fs      half     top      bottom   источник");
for (const row of rows) {
  const source = row.fs > 13.2 ? "авторский хвост" : "обмер";
  console.log(`${row.fs.toFixed(3).padStart(6)}  ${row.half.toFixed(3)}   ${row.top.toFixed(3)}   ${row.bottom.toFixed(3)}   ${source}`);
}
console.log("\nмакс. ширина", (2 * Math.max(...rows.map((r) => r.half))).toFixed(3));
console.log("макс. глубина", Math.max(...rows.map((r) => r.top - r.bottom)).toFixed(3));

const ts = rows.map((row) => `  { fs: ${row.fs.toFixed(3)}, half: ${row.half.toFixed(3)}, top: ${row.top.toFixed(3)}, bottom: ${row.bottom.toFixed(3)} },`).join("\n");
writeFileSync(`${here}fuselage-table.txt`, `${ts}\n`);
console.log("\nwritten fuselage-table.txt");
