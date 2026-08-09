import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const trace = JSON.parse(readFileSync("trace.json", "utf8"));
const { data, info } = await sharp("c47-3view.png").greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const dark = (x, y) => data[y * W + x] < 128;
const P = trace.panels.plan;
const S = trace.panels.side;
const F = trace.panels.front;

const runsCol = (x, p, y0 = p.yMin, y1 = p.yMax) => {
  const out = []; let start = -1;
  for (let y = y0; y <= y1 + 1; y += 1) {
    const on = y <= y1 && dark(x, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  return out;
};
const runsRow = (y, p, x0 = p.xMin, x1 = p.xMax) => {
  const out = []; let start = -1;
  for (let x = x0; x <= x1 + 1; x += 1) {
    const on = x <= x1 && dark(x, y);
    if (on && start < 0) start = x;
    if (!on && start >= 0) { out.push([start, x - 1]); start = -1; }
  }
  return out;
};

const LENGTH_PX = P.xMax - P.xMin;
const HALF_SPAN_PX = (P.yMax - P.yMin) / 2;
const axis = (P.yMin + P.yMax) / 2;
const uOf = (x) => (P.xMax - x) / LENGTH_PX;

// --------------------------------------------- 1. ПЛАН: фюзеляж, внешний обвод
console.log("=== ПЛАН: фюзеляж, внешняя граница в полосе |y-ось| < 130 px ===");
const fusePlan = [];
for (let d = 0; d <= LENGTH_PX; d += 8) {
  const x = P.xMax - d;
  const rs = runsCol(x, P, Math.round(axis - 130), Math.round(axis + 130));
  if (!rs.length) continue;
  const up = axis - rs[0][0];
  const down = rs[rs.length - 1][1] - axis;
  fusePlan.push({ u: +uOf(x).toFixed(4), up: +up.toFixed(1), down: +down.toFixed(1), half: +((up + down) / 2).toFixed(1) });
}
for (let i = 0; i < fusePlan.length; i += 6) {
  const r = fusePlan[i];
  console.log(`  u=${r.u.toFixed(3)} up=${r.up} down=${r.down} полуширина=${r.half}`);
}

// --------------------------------------------- 2. ПЛАН: крыло, кромки
// Задняя кромка прямая около x=689; корневая передняя не выходит за x=1010.
console.log("\n=== ПЛАН: крыло, кромки в окне x∈[640,1020] ===");
const wing = [];
for (let y = P.yMin; y <= axis - 4; y += 6) {
  const rs = runsRow(y, P, 640, 1020);
  if (!rs.length) continue;
  const le = Math.max(...rs.map(([, b]) => b));
  const te = Math.min(...rs.map(([a]) => a));
  wing.push({ bl: +((axis - y) / HALF_SPAN_PX).toFixed(4), leU: +uOf(le).toFixed(4), teU: +uOf(te).toFixed(4), chordU: +((te - le) / -LENGTH_PX).toFixed(4) });
}
for (let i = 0; i < wing.length; i += 4) {
  const r = wing[i];
  console.log(`  bl=${r.bl.toFixed(3)} LE_u=${r.leU.toFixed(4)} TE_u=${r.teU.toFixed(4)} хорда_u=${(r.teU - r.leU).toFixed(4)}`);
}

// --------------------------------------------- 3. ПЛАН: стабилизатор
console.log("\n=== ПЛАН: стабилизатор, кромки в окне x∈[30,260] ===");
for (let y = P.yMin; y <= axis; y += 12) {
  const rs = runsRow(y, P, 30, 265);
  if (!rs.length) continue;
  const le = Math.max(...rs.map(([, b]) => b));
  const te = Math.min(...rs.map(([a]) => a));
  if (le - te < 6) continue;
  console.log(`  bl=${((axis - y) / HALF_SPAN_PX).toFixed(3)} LE_u=${uOf(le).toFixed(4)} TE_u=${uOf(te).toFixed(4)}`);
}

// --------------------------------------------- 4. ПЛАН: мотогондола
console.log("\n=== ПЛАН: мотогондола (правая полуплоскость), внешний обвод ===");
for (let y = 640; y <= 900; y += 8) {
  const rs = runsRow(y, P, 950, 1180);
  if (!rs.length) continue;
  console.log(`  bl=${((axis - y) / HALF_SPAN_PX).toFixed(3)} :: ${rs.map(([a, b]) => `${uOf(b).toFixed(4)}..${uOf(a).toFixed(4)}`).join("  ")}`);
}

// --------------------------------------------- 5. БОК: проверка угла
const THETA = Math.atan(0.169670);
const noseX = S.xMin;
const noseRuns = runsCol(noseX, S);
const noseY = (noseRuns[0][0] + noseRuns[0][1]) / 2;
const toAircraft = (x, y) => {
  const dx = x - noseX; const dy = y - noseY;
  const c = Math.cos(THETA); const s = Math.sin(THETA);
  return { fs: dx * c + dy * s, wl: -(dy * c - dx * s) };
};
console.log(`\n=== БОК: контроль угла ${(THETA * 180 / Math.PI).toFixed(3)}° по линии земли ===`);
// линия земли — самый нижний тонкий прогон; берём её в нескольких колонках
for (const x of [1500, 1700, 1900, 2100, 2300, 2450]) {
  const rs = runsCol(x, S);
  const last = rs[rs.length - 1];
  if (!last) continue;
  const a = toAircraft(x, (last[0] + last[1]) / 2);
  console.log(`  x=${x} низ=${last[0]}-${last[1]} → fs=${a.fs.toFixed(1)} wl=${a.wl.toFixed(1)}`);
}

// --------------------------------------------- 6. БОК: киль и руль
console.log("\n=== БОК: киль/руль, верхняя кромка (fs, wl) ===");
for (let x = 2330; x <= S.xMax; x += 10) {
  const rs = runsCol(x, S);
  if (!rs.length) continue;
  const a = toAircraft(x, rs[0][0]);
  console.log(`  x=${x} fs=${a.fs.toFixed(1)} wl=${a.wl.toFixed(1)}`);
}

// --------------------------------------------- 7. БОК: мотогондола и колесо
console.log("\n=== БОК: прогоны в зоне мотогондолы (x 1600..1800) ===");
for (let x = 1600; x <= 1800; x += 10) {
  const rs = runsCol(x, S);
  console.log(`  x=${x} :: ${rs.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
writeFileSync("tables2.json", JSON.stringify({ fusePlan, wing, THETA, noseX, noseY, LENGTH_PX, HALF_SPAN_PX, axis }));
