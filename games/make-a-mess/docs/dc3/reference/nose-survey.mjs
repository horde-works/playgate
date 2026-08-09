// Обмер носа и фонаря кабины по PD-чертежу C-47.
//
// Каждая колонка снимается СО СВОЕЙ панели и остаётся в СВОИХ станциях:
// именно сведение колонок «на глаз» растянуло нос на метр в ревизии c4.
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

// ------------------------------------------------- 1. Профиль носа (боковая)
const runsCol = (x, panel, y0 = panel.yMin, y1 = panel.yMax) => {
  const out = []; let start = -1;
  for (let y = y0; y <= y1 + 1; y += 1) {
    const on = y <= y1 && dark(x, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  return out;
};
const profile = [];
for (let x = S.xMin; x <= S.xMin + 340; x += 4) {
  const runs = runsCol(x, S);
  if (!runs.length) continue;
  const top = toAircraft(x, runs[0][0]);
  const bottom = toAircraft(x, runs[runs.length - 1][1]);
  profile.push({ topFs: +top.fs.toFixed(4), topWl: +top.wl.toFixed(4), bottomFs: +bottom.fs.toFixed(4), bottomWl: +bottom.wl.toFixed(4) });
}
console.log("=== профиль носа: верх и низ в СВОИХ станциях ===");
for (let i = 0; i < profile.length; i += 4) {
  const r = profile[i];
  console.log(`  верх fs=${r.topFs.toFixed(3)} wl=${r.topWl.toFixed(3)}   низ fs=${r.bottomFs.toFixed(3)} wl=${r.bottomWl.toFixed(3)}`);
}

// ------------------------------------------------- 2. Панели фонаря (боковая)
const visited = new Set();
const panes = [];
for (let y = S.yMin; y <= S.yMin + 120; y += 1) {
  for (let x = S.xMin; x <= S.xMin + 260; x += 1) {
    const key = y * W + x;
    if (!dark(x, y) || visited.has(key)) continue;
    const stack = [[x, y]]; visited.add(key);
    const cells = [];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < S.xMin || nx > S.xMax || ny < S.yMin || ny > S.yMax) continue;
        const nk = ny * W + nx;
        if (visited.has(nk) || !dark(nx, ny)) continue;
        visited.add(nk); stack.push([nx, ny]);
      }
    }
    if (cells.length < 150) continue;
    let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9;
    for (const [cx, cy] of cells) { x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); }
    const fill = cells.length / ((x1 - x0 + 1) * (y1 - y0 + 1));
    if (fill < 0.6) continue;
    const a = toAircraft(x0, y0); const b = toAircraft(x1, y1);
    panes.push({
      front: +Math.min(a.fs, b.fs).toFixed(3), rear: +Math.max(a.fs, b.fs).toFixed(3),
      low: +Math.min(a.wl, b.wl).toFixed(3), high: +Math.max(a.wl, b.wl).toFixed(3),
    });
  }
}
panes.sort((a, b) => a.front - b.front);
console.log("\n=== панели фонаря на боковой проекции (габарит заливки) ===");
for (const pane of panes) {
  console.log(`  fs ${pane.front.toFixed(3)}…${pane.rear.toFixed(3)}  wl ${pane.low.toFixed(3)}…${pane.high.toFixed(3)}  (${(pane.rear - pane.front).toFixed(3)} × ${(pane.high - pane.low).toFixed(3)})`);
}

// ------------------------------------------------- 3. Фонарь в плане
const runsRow = (y, panel, x0, x1) => {
  const out = []; let start = -1;
  for (let x = x0; x <= x1 + 1; x += 1) {
    const on = x <= x1 && dark(x, y);
    if (on && start < 0) start = x;
    if (!on && start >= 0) { out.push([start, x - 1]); start = -1; }
  }
  return out;
};
console.log("\n=== фонарь в плане: тёмные метки остекления по бортам ===");
const planMarks = [];
for (let y = Math.round(axis - 90); y <= axis + 90; y += 2) {
  const runs = runsRow(y, P, 1120, 1271);
  for (const [a, b] of runs) {
    if (b - a < 3) continue;
    planMarks.push({ bl: +((axis - y) * K_PLAN_BL).toFixed(3), front: +((P.xMax - b) * K_PLAN_FS).toFixed(3), rear: +((P.xMax - a) * K_PLAN_FS).toFixed(3) });
  }
}
const grouped = new Map();
for (const mark of planMarks) {
  const key = Math.round(mark.bl * 20);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(mark);
}
for (const [key, list] of [...grouped.entries()].sort((a, b) => b[0] - a[0])) {
  const front = Math.min(...list.map((m) => m.front));
  const rear = Math.max(...list.map((m) => m.rear));
  console.log(`  bl=${(key / 20).toFixed(2)}  fs ${front.toFixed(3)}…${rear.toFixed(3)}`);
}

// ------------------------------------------------- 4. Полуширина носа в плане
console.log("\n=== полуширина фюзеляжа в носовой части (план) ===");
const planHalf = [];
for (let d = 0; d <= 300; d += 6) {
  const x = P.xMax - d;
  const runs = runsCol(x, P, Math.round(axis - 130), Math.round(axis + 130));
  if (!runs.length) continue;
  const half = ((axis - runs[0][0]) + (runs[runs.length - 1][1] - axis)) / 2;
  planHalf.push({ fs: +(d * K_PLAN_FS).toFixed(3), half: +(half * K_PLAN_BL).toFixed(3) });
}
for (let i = 0; i < planHalf.length; i += 2) {
  console.log(`  fs=${planHalf[i].fs.toFixed(3)}  полуширина=${planHalf[i].half.toFixed(3)}`);
}

writeFileSync(`${here}nose-survey.json`, JSON.stringify({ profile, panes, planHalf, planMarks }, null, 1));
console.log("\nwritten nose-survey.json");
