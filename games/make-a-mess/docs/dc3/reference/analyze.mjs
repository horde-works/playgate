import sharp from "/Users/kirisyuk/cursor/playgate/node_modules/sharp/lib/index.js";
import { readFileSync, writeFileSync } from "node:fs";

const trace = JSON.parse(readFileSync("trace.json", "utf8"));
const { data, info } = await sharp("c47-3view.png").greyscale().raw().toBuffer({ resolveWithObject: true });
const { width } = info;
const dark = (x, y) => data[y * width + x] < 128;

const P = trace.panels.plan;
const S = trace.panels.side;
const F = trace.panels.front;

// ---------------------------------------------------------------- масштаб
// Размах — единственный размер, одинаковый у DC-3 и C-47 (95 ft 0 in).
// Он же виден в двух проекциях независимо, поэтому им и калибруем чертёж.
const SPAN_M = 28.956; // 95 ft 0 in
const spanPlanPx = P.yMax - P.yMin;
const spanFrontPx = F.xMax - F.xMin;
const scale = SPAN_M / ((spanPlanPx + spanFrontPx) / 2);
console.log(`размах: план ${spanPlanPx} px, фронт ${spanFrontPx} px, расхождение ${(100 * Math.abs(spanPlanPx - spanFrontPx) / spanPlanPx).toFixed(2)}%`);
console.log(`масштаб чертежа: ${(scale * 1000).toFixed(4)} мм/px`);
console.log(`длина по плану: ${((P.xMax - P.xMin) * scale).toFixed(3)} м (DC-3 напечатано 19.66, C-47 19.43)`);
console.log(`высота по боку (земля→киль): ${((S.yMax - S.yMin) * scale).toFixed(3)} м (напечатано 5.16)`);

// ------------------------------------------------- окна: угол стояночной позы
// Окна салона — тёмные заливки; их центры лежат на прямой, параллельной
// строительной горизонтали фюзеляжа. Угол между ней и линией земли — поза.
const visited = new Set();
const blobs = [];
for (let y = S.yMin; y <= S.yMax; y += 1) {
  for (let x = S.xMin; x <= S.xMax; x += 1) {
    const key = y * width + x;
    if (!dark(x, y) || visited.has(key)) continue;
    const stack = [[x, y]];
    visited.add(key);
    const cells = [];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < S.xMin || nx > S.xMax || ny < S.yMin || ny > S.yMax) continue;
        const nkey = ny * width + nx;
        if (visited.has(nkey) || !dark(nx, ny)) continue;
        visited.add(nkey);
        stack.push([nx, ny]);
      }
    }
    if (cells.length < 60) continue;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    let sx = 0; let sy = 0;
    for (const [cx, cy] of cells) {
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      sx += cx; sy += cy;
    }
    const boxArea = (x1 - x0 + 1) * (y1 - y0 + 1);
    blobs.push({ n: cells.length, x0, x1, y0, y1, cx: sx / cells.length, cy: sy / cells.length, fill: cells.length / boxArea });
  }
}
const windows = blobs
  .filter((b) => b.fill > 0.7 && b.x1 - b.x0 < 60 && b.y1 - b.y0 < 60 && b.n > 200)
  .sort((a, b) => a.cx - b.cx);
console.log(`\nсплошные заливки в боковой проекции: ${blobs.length}, из них окноподобных ${windows.length}`);
for (const w of windows) {
  console.log(`  окно cx=${w.cx.toFixed(1)} cy=${w.cy.toFixed(1)} w=${w.x1 - w.x0 + 1} h=${w.y1 - w.y0 + 1} заполнение=${w.fill.toFixed(2)}`);
}
// линия окон салона: берём только крупные (кабинные окна мельче и выше)
const cabin = windows.filter((w) => w.x1 - w.x0 >= 20 && w.y1 - w.y0 >= 20);
if (cabin.length >= 3) {
  const n = cabin.length;
  const mx = cabin.reduce((s, w) => s + w.cx, 0) / n;
  const my = cabin.reduce((s, w) => s + w.cy, 0) / n;
  const num = cabin.reduce((s, w) => s + (w.cx - mx) * (w.cy - my), 0);
  const den = cabin.reduce((s, w) => s + (w.cx - mx) ** 2, 0);
  const slope = num / den;
  const rms = Math.sqrt(cabin.reduce((s, w) => s + (w.cy - (my + slope * (w.cx - mx))) ** 2, 0) / n);
  console.log(`\nлиния окон салона по ${n} окнам: наклон ${slope.toFixed(5)} → ${(Math.atan(slope) * 180 / Math.PI).toFixed(2)}° к линии земли, СКО ${rms.toFixed(2)} px`);
  // шаг окон вдоль строительной горизонтали
  const step = [];
  for (let i = 1; i < cabin.length; i += 1) {
    step.push(Math.hypot(cabin[i].cx - cabin[i - 1].cx, cabin[i].cy - cabin[i - 1].cy) * scale);
  }
  console.log(`шаг окон, м: ${step.map((s) => s.toFixed(3)).join(", ")}`);
  console.log(`размер окна: ${((cabin[0].x1 - cabin[0].x0 + 1) * scale).toFixed(3)} × ${((cabin[0].y1 - cabin[0].y0 + 1) * scale).toFixed(3)} м (по заливке)`);
}

// --------------------------------------------------- прогоны по колонке (бок)
const runs = (x, panel) => {
  const out = [];
  let start = -1;
  for (let y = panel.yMin; y <= panel.yMax + 1; y += 1) {
    const on = y <= panel.yMax && dark(x, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { out.push([start, y - 1]); start = -1; }
  }
  return out;
};
console.log("\nбоковая проекция, прогоны по колонкам (x: пары начало-конец):");
for (let x = S.xMin; x <= S.xMax; x += 40) {
  const r = runs(x, S);
  console.log(`  x=${x} :: ${r.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
console.log("\nфронтальная проекция, прогоны по колонкам:");
for (let x = F.xMin; x <= F.xMax; x += 60) {
  const r = runs(x, F);
  console.log(`  x=${x} :: ${r.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
console.log("\nплан, прогоны по колонкам:");
for (let x = P.xMin; x <= P.xMax; x += 40) {
  const r = runs(x, P);
  console.log(`  x=${x} :: ${r.map(([a, b]) => `${a}-${b}`).join("  ")}`);
}
writeFileSync("scale.json", JSON.stringify({ scale, SPAN_M, spanPlanPx, spanFrontPx }));
