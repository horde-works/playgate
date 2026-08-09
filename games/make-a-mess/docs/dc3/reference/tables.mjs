// Снятие контрольных таблиц с PD-чертежа C-47.
// Форма — отсюда; абсолютный масштаб — от напечатанных размеров DC-3.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const trace = JSON.parse(readFileSync("trace.json", "utf8"));
const { data, info } = await sharp("c47-3view.png").greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const dark = (x, y) => data[y * W + x] < 128;
const P = trace.panels.plan;
const S = trace.panels.side;
const F = trace.panels.front;

const runsCol = (x, p) => {
  const out = []; let start = -1;
  for (let y = p.yMin; y <= p.yMax + 1; y += 1) {
    const on = y <= p.yMax && dark(x, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  return out;
};
const runsRow = (y, p) => {
  const out = []; let start = -1;
  for (let x = p.xMin; x <= p.xMax + 1; x += 1) {
    const on = x <= p.xMax && dark(x, y);
    if (on && start < 0) start = x;
    if (!on && start >= 0) { out.push([start, x - 1]); start = -1; }
  }
  return out;
};

// ---------------------------------------------------------------- 1. ПЛАН
// Нос справа (x=xMax), хвост слева. Ось фюзеляжа — середина размаха.
const axis = (P.yMin + P.yMax) / 2;
const planScale = 1 / (P.xMax - P.xMin); // доля длины
console.log("=== ПЛАН: полуширина фюзеляжа (ближайшая к оси пара границ) ===");
console.log("u = доля длины от носа; halfUp/halfDown в px от оси");
const planFuselage = [];
for (let d = 0; d <= P.xMax - P.xMin; d += 12) {
  const x = P.xMax - d;
  const rs = runsCol(x, P);
  let up = null; let down = null;
  for (const [a, b] of rs) {
    const mid = (a + b) / 2;
    if (mid <= axis && (up === null || axis - mid < axis - up)) up = mid;
    if (mid >= axis && (down === null || mid - axis < down - axis)) down = mid;
  }
  planFuselage.push({ u: +(d * planScale).toFixed(4), x, up: up === null ? null : +(axis - up).toFixed(1), down: down === null ? null : +(down - axis).toFixed(1) });
}
for (let i = 0; i < planFuselage.length; i += 4) {
  const r = planFuselage[i];
  console.log(`  u=${r.u.toFixed(3)} x=${r.x} up=${r.up} down=${r.down}`);
}

// Крыло в плане: для каждой строки (станции по размаху) — крайние x-границы.
console.log("\n=== ПЛАН: крыло, передняя/задняя кромка по размаху ===");
console.log("bl = доля полуразмаха от оси; LE/TE в долях длины от носа");
const halfSpanPx = (P.yMax - P.yMin) / 2;
const wing = [];
for (let y = P.yMin; y <= axis; y += 12) {
  const rs = runsRow(y, P);
  if (!rs.length) continue;
  const le = Math.max(...rs.map(([, b]) => b));
  const te = Math.min(...rs.map(([a]) => a));
  wing.push({ bl: +((axis - y) / halfSpanPx).toFixed(4), y, le: +((P.xMax - le) * planScale).toFixed(4), te: +((P.xMax - te) * planScale).toFixed(4) });
}
for (let i = 0; i < wing.length; i += 3) {
  const r = wing[i];
  console.log(`  bl=${r.bl.toFixed(3)} y=${r.y} LE_u=${r.le.toFixed(4)} TE_u=${r.te.toFixed(4)} хорда_u=${(r.te - r.le).toFixed(4)}`);
}

// ---------------------------------------------------------------- 2. БОК
// Разворот на угол стоянки: строим в самолётной системе.
const THETA = Math.atan(0.169670);
console.log(`\n=== БОК: угол стоянки ${(THETA * 180 / Math.PI).toFixed(3)}° ===`);
const noseX = S.xMin;
const noseRuns = runsCol(noseX, S);
const noseY = (noseRuns[0][0] + noseRuns[0][1]) / 2;
// координаты в самолётной раме: fsPx вдоль строительной оси, wlPx вверх
const toAircraft = (x, y) => {
  const dx = x - noseX; const dy = y - noseY; // dy вниз
  const c = Math.cos(THETA); const s = Math.sin(THETA);
  return { fs: dx * c + dy * s, wl: -(dy * c - dx * s) };
};
console.log("fs/wl в px самолётной рамы; верх и низ фюзеляжа");
const sideProfile = [];
for (let x = S.xMin; x <= S.xMax; x += 8) {
  const rs = runsCol(x, S);
  if (!rs.length) continue;
  const top = toAircraft(x, rs[0][0]);
  const bottomRun = rs[rs.length - 1];
  const isGround = bottomRun[1] >= S.yMax - 6 && bottomRun[1] - bottomRun[0] <= 6;
  const bottomY = isGround ? (rs.length > 1 ? rs[rs.length - 2][1] : rs[0][1]) : bottomRun[1];
  const bottom = toAircraft(x, bottomY);
  sideProfile.push({ x, fsTop: +top.fs.toFixed(1), wlTop: +top.wl.toFixed(1), fsBot: +bottom.fs.toFixed(1), wlBot: +bottom.wl.toFixed(1) });
}
for (let i = 0; i < sideProfile.length; i += 3) {
  const r = sideProfile[i];
  console.log(`  x=${r.x} верх fs=${r.fsTop} wl=${r.wlTop} | низ fs=${r.fsBot} wl=${r.wlBot}`);
}
const groundLine = S.yMax;
const g = toAircraft(S.xMin, groundLine);
console.log(`линия земли под носом: wl=${g.wl.toFixed(1)} px`);

// ---------------------------------------------------------------- 3. ФРОНТ
console.log("\n=== ФРОНТ: поперечное V и сечения ===");
const cxF = (F.xMin + F.xMax) / 2;
const halfSpanF = (F.xMax - F.xMin) / 2;
for (let d = 0; d <= halfSpanF; d += 40) {
  const x = Math.round(cxF - d);
  const rs = runsCol(x, F);
  if (!rs.length) continue;
  console.log(`  bl=${(d / halfSpanF).toFixed(3)} x=${x} :: ${rs.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
writeFileSync("tables.json", JSON.stringify({ planFuselage, wing, sideProfile, THETA, noseX, noseY }));
