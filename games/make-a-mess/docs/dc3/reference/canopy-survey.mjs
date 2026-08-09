/**
 * Обмер остекления кабины по PD-чертежу C-47: КАЖДАЯ ПАНЕЛЬ ОТДЕЛЬНО.
 *
 * Заливки остекления распознаются как связные компоненты и описываются не
 * прямоугольником, а своими углами: панель фонаря — параллелограмм, и её
 * наклон и есть искомое инженерное число.
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
const toSide = (x, y) => {
  const dx = x - S.xMin; const dy = y - 1483.5;
  const c = Math.cos(THETA); const s = Math.sin(THETA);
  return { fs: (dx * c + dy * s) * K_SIDE, wl: -(dy * c - dx * s) * K_SIDE };
};
const toPlan = (x, y) => ({ fs: (P.xMax - x) * K_PLAN_FS, bl: (axis - y) * K_PLAN_BL });

/** Связные компоненты заливки в окне; для каждой — все пиксели. */
const blobs = (x0, y0, x1, y1, minSize) => {
  const seen = new Set();
  const found = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const key = y * W + x;
      if (!dark(x, y) || seen.has(key)) continue;
      const stack = [[x, y]]; seen.add(key);
      const cells = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx; const ny = cy + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nk = ny * W + nx;
          if (seen.has(nk) || !dark(nx, ny)) continue;
          seen.add(nk); stack.push([nx, ny]);
        }
      }
      if (cells.length >= minSize) found.push(cells);
    }
  }
  return found;
};

/** Четыре угла заливки: крайние точки по двум диагоналям. */
const corners = (cells) => {
  const pick = (score) => cells.reduce((best, cell) => (score(cell) > score(best) ? cell : best));
  return {
    minSum: pick(([x, y]) => -(x + y)),
    maxSum: pick(([x, y]) => x + y),
    minDiff: pick(([x, y]) => -(x - y)),
    maxDiff: pick(([x, y]) => x - y),
  };
};

console.log("=== БОКОВАЯ: панели остекления кабины ===");
const sidePanes = blobs(S.xMin, S.yMin, S.xMin + 280, S.yMin + 130, 120)
  .map((cells) => {
    const nodes = cells.map(([x, y]) => toSide(x, y));
    const c = corners(cells);
    return {
      cells: cells.length,
      fsFrom: Math.min(...nodes.map((n) => n.fs)), fsTo: Math.max(...nodes.map((n) => n.fs)),
      wlLow: Math.min(...nodes.map((n) => n.wl)), wlHigh: Math.max(...nodes.map((n) => n.wl)),
      corners: Object.fromEntries(Object.entries(c).map(([key, [x, y]]) => [key, toSide(x, y)])),
    };
  })
  .sort((a, b) => a.fsFrom - b.fsFrom);
for (const [index, pane] of sidePanes.entries()) {
  console.log(`  панель ${index}: fs ${pane.fsFrom.toFixed(3)}…${pane.fsTo.toFixed(3)} (${(pane.fsTo - pane.fsFrom).toFixed(3)}), wl ${pane.wlLow.toFixed(3)}…${pane.wlHigh.toFixed(3)} (${(pane.wlHigh - pane.wlLow).toFixed(3)}), пикселей ${pane.cells}`);
  const list = Object.entries(pane.corners).map(([key, node]) => `${key} fs=${node.fs.toFixed(3)} wl=${node.wl.toFixed(3)}`);
  console.log(`      углы: ${list.join(" | ")}`);
}

console.log("\n=== ПЛАН: панели остекления кабины ===");
const planPanes = blobs(P.xMax - 210, Math.round(axis - 110), P.xMax, Math.round(axis + 110), 60)
  .map((cells) => {
    const nodes = cells.map(([x, y]) => toPlan(x, y));
    return {
      cells: cells.length,
      fsFrom: Math.min(...nodes.map((n) => n.fs)), fsTo: Math.max(...nodes.map((n) => n.fs)),
      blLow: Math.min(...nodes.map((n) => n.bl)), blHigh: Math.max(...nodes.map((n) => n.bl)),
    };
  })
  .filter((pane) => pane.fsTo - pane.fsFrom < 1.2)
  .sort((a, b) => b.blHigh - a.blHigh);
for (const [index, pane] of planPanes.entries()) {
  console.log(`  панель ${index}: bl ${pane.blLow.toFixed(3)}…${pane.blHigh.toFixed(3)} (${(pane.blHigh - pane.blLow).toFixed(3)}), fs ${pane.fsFrom.toFixed(3)}…${pane.fsTo.toFixed(3)}, пикселей ${pane.cells}`);
}
const straddling = planPanes.filter((pane) => pane.blLow < 0 && pane.blHigh > 0);
console.log(`\nпанелей, пересекающих плоскость симметрии: ${straddling.length}`);
writeFileSync(`${here}canopy-survey.json`, JSON.stringify({ sidePanes, planPanes }, null, 1));
