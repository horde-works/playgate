import sharp from "sharp";
import { readFileSync } from "node:fs";
const trace = JSON.parse(readFileSync("trace.json", "utf8"));
const { data, info } = await sharp("c47-3view.png").greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const dark = (x, y) => data[y * W + x] < 128;
const P = trace.panels.plan; const S = trace.panels.side;
const LEN = P.xMax - P.xMin; const HALF = (P.yMax - P.yMin) / 2; const axis = (P.yMin + P.yMax) / 2;
const K_FS = 19.66 / LEN, K_BL = 28.956 / (P.yMax - P.yMin), K_SIDE = 19.66 / 1211;
const runsCol = (x, p, y0 = p.yMin, y1 = p.yMax) => {
  const o = []; let s = -1;
  for (let y = y0; y <= y1 + 1; y += 1) { const on = y <= y1 && dark(x, y); if (on && s < 0) s = y; if (!on && s >= 0) { o.push([s, y - 1]); s = -1; } } return o;
};
const runsRow = (y, p, x0 = p.xMin, x1 = p.xMax) => {
  const o = []; let s = -1;
  for (let x = x0; x <= x1 + 1; x += 1) { const on = x <= x1 && dark(x, y); if (on && s < 0) s = x; if (!on && s >= 0) { o.push([s, x - 1]); s = -1; } } return o;
};
console.log("=== ПЛАН: хвостовой конус, узкая полоса |y-ось|<62 ===");
for (let d = Math.round(0.80 * LEN); d <= LEN; d += 10) {
  const x = P.xMax - d; const rs = runsCol(x, P, Math.round(axis - 62), Math.round(axis + 62));
  if (!rs.length) continue;
  const hw = ((axis - rs[0][0]) + (rs[rs.length - 1][1] - axis)) / 2;
  console.log(`  fs=${(d * K_FS).toFixed(2)} м  полуширина=${(hw * K_BL).toFixed(3)} м`);
}
const THETA = Math.atan(0.169670);
const noseX = S.xMin; const noseY = 1483.5;
const toA = (x, y) => { const dx = x - noseX, dy = y - noseY, c = Math.cos(THETA), s = Math.sin(THETA); return { fs: (dx * c + dy * s) * K_SIDE, wl: -(dy * c - dx * s) * K_SIDE }; };
console.log("\n=== БОК: киль и руль — передняя и задняя кромки по высоте ===");
for (let y = 1410; y <= 1560; y += 8) {
  const rs = runsRow(y, S, 2300, S.xMax);
  if (!rs.length) continue;
  const le = rs[0][0]; const te = rs[rs.length - 1][1];
  const a = toA(le, y); const b = toA(te, y);
  console.log(`  y=${y}  ПК fs=${a.fs.toFixed(2)} wl=${a.wl.toFixed(2)} | ЗК fs=${b.fs.toFixed(2)} wl=${b.wl.toFixed(2)}  прогоны=${rs.length}`);
}
console.log("\n=== БОК: хвостовая часть фюзеляжа, верх/низ ===");
for (let x = 2280; x <= 2560; x += 10) {
  const rs = runsCol(x, S);
  if (!rs.length) continue;
  const t = toA(x, rs[0][0]);
  const lastRun = rs[rs.length - 1];
  const isGround = lastRun[1] >= S.yMax - 6 && lastRun[1] - lastRun[0] <= 6;
  const by = isGround ? (rs.length > 1 ? rs[rs.length - 2][1] : lastRun[1]) : lastRun[1];
  const b = toA(x, by);
  console.log(`  x=${x} верх fs=${t.fs.toFixed(2)} wl=${t.wl.toFixed(2)} | низ fs=${b.fs.toFixed(2)} wl=${b.wl.toFixed(2)}`);
}
console.log("\n=== БОК: мотогондола, внешний обвод (fs, wl) ===");
for (let x = 1590; x <= 1810; x += 10) {
  const rs = runsCol(x, S, 1560, 1720);
  if (!rs.length) continue;
  const t = toA(x, rs[0][0]); const b = toA(x, rs[rs.length - 1][1]);
  console.log(`  x=${x} верх fs=${t.fs.toFixed(2)} wl=${t.wl.toFixed(2)} | низ fs=${b.fs.toFixed(2)} wl=${b.wl.toFixed(2)}`);
}
console.log("\n=== БОК: положение крыла у борта (корневая хорда) ===");
for (let x = 1700; x <= 2000; x += 20) {
  const rs = runsCol(x, S, 1540, 1700);
  console.log(`  x=${x} :: ${rs.map(([a, b]) => `${toA(x, a).wl.toFixed(2)}..${toA(x, b).wl.toFixed(2)}`).join("  ")}`);
}
