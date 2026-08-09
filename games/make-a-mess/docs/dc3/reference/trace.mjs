// Трассировка PD-чертежа C-47: три панели, силуэт по колонкам.
// Масштаб отсюда НЕ берём — только форму; абсолют идёт от напечатанных размеров DC-3.
// Панели плана и фронта пересекаются рамками, поэтому пиксель относится к панели
// по МЕТКЕ СВЯЗНОЙ КОМПОНЕНТЫ своей клетки, а не по попаданию в прямоугольник.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const file = "c47-3view.png";
const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const dark = (x, y) => data[y * width + x] < 128;

const cell = 24;
const cols = Math.ceil(width / cell);
const rows = Math.ceil(height / cell);
const occupancy = new Uint8Array(cols * rows);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (dark(x, y)) occupancy[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
  }
}
const grown = new Uint8Array(occupancy);
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    if (!occupancy[r * cols + c]) continue;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const rr = r + dr; const cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) grown[rr * cols + cc] = 1;
      }
    }
  }
}
const label = new Int32Array(cols * rows).fill(-1);
const clusters = [];
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    const index = r * cols + c;
    if (!grown[index] || label[index] >= 0) continue;
    const id = clusters.length;
    const stack = [index];
    label[index] = id;
    let size = 0;
    while (stack.length) {
      const current = stack.pop();
      size += 1;
      const cr = Math.floor(current / cols); const cc = current % cols;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const rr = cr + dr; const ccx = cc + dc;
          if (rr < 0 || rr >= rows || ccx < 0 || ccx >= cols) continue;
          const next = rr * cols + ccx;
          if (grown[next] && label[next] < 0) { label[next] = id; stack.push(next); }
        }
      }
    }
    clusters.push({ id, size });
  }
}
const labelOf = (x, y) => label[Math.floor(y / cell) * cols + Math.floor(x / cell)];

// Пиксели каждой панели
const pixelsByCluster = new Map();
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (!dark(x, y)) continue;
    const id = labelOf(x, y);
    if (!pixelsByCluster.has(id)) pixelsByCluster.set(id, []);
    pixelsByCluster.get(id).push([x, y]);
  }
}
const ranked = [...pixelsByCluster.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);

const build = (pixels) => {
  let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity;
  for (const [x, y] of pixels) {
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  const columnTop = new Int32Array(xMax - xMin + 1).fill(-1);
  const columnBottom = new Int32Array(xMax - xMin + 1).fill(-1);
  const rowLeft = new Int32Array(yMax - yMin + 1).fill(-1);
  const rowRight = new Int32Array(yMax - yMin + 1).fill(-1);
  for (const [x, y] of pixels) {
    const ci = x - xMin; const ri = y - yMin;
    if (columnTop[ci] < 0 || y < columnTop[ci]) columnTop[ci] = y;
    if (y > columnBottom[ci]) columnBottom[ci] = y;
    if (rowLeft[ri] < 0 || x < rowLeft[ri]) rowLeft[ri] = x;
    if (x > rowRight[ri]) rowRight[ri] = x;
  }
  return {
    xMin, xMax, yMin, yMax,
    columnTop: [...columnTop], columnBottom: [...columnBottom],
    rowLeft: [...rowLeft], rowRight: [...rowRight],
  };
};

const named = {};
for (const [id, pixels] of ranked) {
  const panel = build(pixels);
  const key = panel.yMax - panel.yMin > 1000 ? "plan" : panel.xMin > 1200 ? "side" : "front";
  named[key] = panel;
  console.log(`${key}: x=[${panel.xMin},${panel.xMax}] w=${panel.xMax - panel.xMin} y=[${panel.yMin},${panel.yMax}] h=${panel.yMax - panel.yMin} pixels=${pixels.length}`);
}
writeFileSync("trace.json", JSON.stringify({ file, width, height, panels: named }));
console.log("written trace.json");
