import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("games/make-a-mess/docs/tilt-hexacopter/b11-contours");
const width = 2400;
const height = 1800;
const tileWidth = 1200;
const tileHeight = 810;
const views = [
  ["top", "A · PLAN SILHOUETTE"],
  ["dorsal-profile", "B · NOSE → LOW CANOPY → SHARK RIDGE"],
  ["central-body-three-quarter", "C · INTEGRATED GLAZING · B10 REAR RETAINED"],
  ["rear-three-quarter", "D · CENTRAL CORE BOOM · REAR THREE-QUARTER"],
];
const composites = [];
for (const [index, [id, label]] of views.entries()) {
  const source = path.join(output, `${id}.png`);
  await fs.access(source);
  const render = await sharp(source)
    .extract({ left: 0, top: 78, width: 1600, height: 836 })
    .resize(tileWidth, tileHeight - 54, { fit: "contain", background: "#e7eaec" })
    .png().toBuffer();
  const caption = Buffer.from(`<svg width="1200" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151b1e"/><text x="24" y="36" fill="#f4f6f7" font-family="sans-serif" font-size="25" font-weight="700">${label}</text></svg>`);
  const left = (index % 2) * tileWidth;
  const top = 110 + Math.floor(index / 2) * tileHeight;
  composites.push({ input: render, left, top }, { input: caption, left, top: top + tileHeight - 54 });
}
const header = Buffer.from(`<svg width="2400" height="110" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="50" fill="#13191c" font-family="sans-serif" font-size="34" font-weight="800">TILT HEXACOPTER B11 · INTEGRATED NOSE / CANOPY / RIDGE FLOW</text><text x="55" y="84" fill="#556168" font-family="sans-serif" font-size="20">B10 MASSING RETAINED · BUBBLE CROWN REMOVED · LOW GLAZING RISES CONTINUOUSLY INTO THE SHARK RIDGE</text></svg>`);
const footer = Buffer.from(`<svg width="2400" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="44" fill="#566168" font-family="monospace" font-size="18">B11 CONTOUR GATE · METRES · Y UP · +Z FRONT · ENGINEERING REMAINS PAUSED</text></svg>`);
await sharp({ create: { width, height, channels: 3, background: "#e7eaec" } })
  .composite([{ input: header, left: 0, top: 0 }, ...composites, { input: footer, left: 0, top: 1730 }])
  .png().toFile(path.join(output, "aggressive-contour-sheet.png"));
