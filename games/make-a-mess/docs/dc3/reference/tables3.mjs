import sharp from "sharp";
import { readFileSync } from "node:fs";

const trace = JSON.parse(readFileSync("trace.json", "utf8"));
const { data, info } = await sharp("c47-3view.png").greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const dark = (x, y) => data[y * W + x] < 128;
const P = trace.panels.plan;
const S = trace.panels.side;
const F = trace.panels.front;
const LEN = P.xMax - P.xMin;               // длина в плане, px
const HALF = (P.yMax - P.yMin) / 2;        // полуразмах в плане, px
const axis = (P.yMin + P.yMax) / 2;
const SIDE_LEN = 1211;                     // длина в боковой проекции, px (нос→ЗК руля)
const runsCol = (x, p, y0 = p.yMin, y1 = p.yMax) => {
  const out = []; let s = -1;
  for (let y = y0; y <= y1 + 1; y += 1) {
    const on = y <= y1 && dark(x, y);
    if (on && s < 0) s = y;
    if (!on && s >= 0) { out.push([s, y - 1]); s = -1; }
  }
  return out;
};
const runsRow = (y, p, x0 = p.xMin, x1 = p.xMax) => {
  const out = []; let s = -1;
  for (let x = x0; x <= x1 + 1; x += 1) {
    const on = x <= x1 && dark(x, y);
    if (on && s < 0) s = x;
    if (!on && s >= 0) { out.push([s, x - 1]); s = -1; }
  }
  return out;
};

console.log("=== ФРОНТ: фюзеляж, стойки, колея ===");
const cxF = (F.xMin + F.xMax) / 2;
const halfF = (F.xMax - F.xMin) / 2;
// фюзеляж: строка через центр
for (const y of [430, 450, 470, 490, 510, 530, 550, 565]) {
  const rs = runsRow(y, F, Math.round(cxF - 200), Math.round(cxF + 200));
  console.log(`  y=${y} :: ${rs.map(([a, b]) => `${(a - cxF).toFixed(0)}..${(b - cxF).toFixed(0)}`).join("  ")}`);
}
// колёса: самые нижние прогоны слева и справа от оси
console.log("  нижние прогоны (колёса):");
for (let x = Math.round(cxF - 260); x <= cxF + 260; x += 10) {
  const rs = runsCol(x, F);
  if (!rs.length) continue;
  const last = rs[rs.length - 1];
  if (last[1] < 600) continue;
  console.log(`    dx=${(x - cxF).toFixed(0)} bl=${((x - cxF) / halfF).toFixed(3)} низ=${last[0]}-${last[1]}`);
}

console.log("\n=== БОК: круги колёс (заливка по строкам) ===");
// главное колесо выпущенное — пунктирный круг под мотогондолой; ищем крайние точки
for (let y = 1650; y <= 1740; y += 6) {
  const rs = runsRow(y, S, 1600, 1760);
  if (!rs.length) continue;
  console.log(`  y=${y} :: ${rs.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
console.log("  хвостовое колесо:");
for (let y = 1690; y <= 1740; y += 4) {
  const rs = runsRow(y, S, 2360, 2450);
  if (!rs.length) continue;
  console.log(`    y=${y} :: ${rs.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}

console.log("\n=== ПЛАН: размах стабилизатора и обвод хвоста ===");
for (let y = P.yMin; y <= axis; y += 4) {
  const rs = runsRow(y, P, 30, 265);
  if (rs.length) { console.log(`  первая строка со стабилизатором: y=${y} bl=${((axis - y) / HALF).toFixed(4)} → полуразмах ГО = ${((axis - y) / HALF * 14.478).toFixed(3)} м`); break; }
}
console.log("\n=== ПЛАН: винт (диаметр по кругу лопастей) ===");
for (let y = 620; y <= 900; y += 10) {
  const rs = runsRow(y, P, 1080, 1200);
  if (!rs.length) continue;
  console.log(`  y=${y} bl=${((axis - y) / HALF).toFixed(3)} :: ${rs.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
console.log("\n=== ПЛАН: ось мотогондолы (bl центра) и её длина ===");
for (const y of [700, 720, 740, 760, 780, 800, 820, 840]) {
  const rs = runsRow(y, P, 640, 1200);
  console.log(`  bl=${((axis - y) / HALF).toFixed(3)} :: ${rs.map(([a, b]) => `${((P.xMax - b) / LEN).toFixed(4)}..${((P.xMax - a) / LEN).toFixed(4)}`).join("  ")}`);
}
