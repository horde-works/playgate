import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("games/make-a-mess/docs/tilt-hexacopter/b03");
const tiles = [
  ["front", "FRONT"], ["rear", "REAR"], ["left", "ARMOURED SIDE"], ["dorsal-profile", "DORSAL PROFILE"],
  ["top", "TOP"], ["front-three-quarter", "FRONT 3/4"],
  ["rear-three-quarter", "REAR 3/4"], ["reference-match", "REFERENCE MASSING"],
  ["primary-core-isometric", "ISOLATED PRIMARY CORE"], ["primary-core-load-path", "CORE LOAD PATH"],
  ["independent-tilt", "INDEPENDENT TILT"], ["side-hover", "SIDE HOVER"],
];

const width = 1920;
const cellWidth = 480;
const cellHeight = 338;
const composites = [];
for (const [index, [id, label]] of tiles.entries()) {
  const file = path.join(output, `${id}.png`);
  await fs.access(file);
  const thumb = await sharp(file).resize(cellWidth, cellHeight - 38, { fit: "cover" }).png().toBuffer();
  const x = (index % 4) * cellWidth;
  const y = Math.floor(index / 4) * cellHeight;
  composites.push({ input: thumb, left: x, top: y });
  composites.push({
    input: Buffer.from(`<svg width="${cellWidth}" height="38" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#11171a"/><text x="18" y="27" fill="#f2f4f5" font-family="sans-serif" font-size="20" font-weight="700">${label}</text></svg>`),
    left: x,
    top: y + cellHeight - 38,
  });
}

await sharp({ create: { width, height: cellHeight * 3, channels: 3, background: "#0d1113" } })
  .composite(composites)
  .png()
  .toFile(path.join(output, "overview-sheet.png"));

const plateTile = async (id, label, tileWidth, tileHeight) => {
  const render = await sharp(path.join(output, `${id}.png`))
    .extract({ left: 0, top: 78, width: 1600, height: 836 })
    .resize(tileWidth, tileHeight - 54, { fit: "contain", background: "#e7eaec" })
    .png()
    .toBuffer();
  const caption = Buffer.from(`<svg width="${tileWidth}" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151b1e"/><text x="24" y="36" fill="#f4f6f7" font-family="sans-serif" font-size="25" font-weight="700">${label}</text></svg>`);
  return { render, caption };
};

const plateWidth = 2400;
const plateHeight = 1800;
const plateHeader = Buffer.from(`<svg width="2400" height="110" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="50" fill="#13191c" font-family="sans-serif" font-size="34" font-weight="800">TILT HEXACOPTER B03 · ORTHOGRAPHIC PROJECT PLATE</text><text x="55" y="84" fill="#556168" font-family="sans-serif" font-size="20">AUTHORED REVIEW DIMENSIONS · ROTOR Ø 2.10 m · PITCH 2.50 m · 6 INDEPENDENT LIFT DUCTS · 2 UPPER ENGINES</text></svg>`);
const plateFooter = Buffer.from(`<svg width="2400" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="44" fill="#566168" font-family="monospace" font-size="18">B03 · METRES · Y UP · +Z FRONT · OWNER CONTOUR/MECHANISM REVIEW · NOT A MANUFACTURING RELEASE</text><text x="2210" y="44" fill="#151b1e" font-family="sans-serif" font-size="20" font-weight="700">2026-08-16</text></svg>`);
const orthographic = [];
for (const [index, [id, label]] of [["top", "A · TOP"], ["front", "B · FRONT"], ["left", "C · LEFT"], ["rear", "D · REAR"]].entries()) {
  const tile = await plateTile(id, label, 1200, 810);
  const left = (index % 2) * 1200;
  const top = 110 + Math.floor(index / 2) * 810;
  orthographic.push({ input: tile.render, left, top });
  orthographic.push({ input: tile.caption, left, top: top + 756 });
}
await sharp({ create: { width: plateWidth, height: plateHeight, channels: 3, background: "#e7eaec" } })
  .composite([{ input: plateHeader, left: 0, top: 0 }, ...orthographic, { input: plateFooter, left: 0, top: 1730 }])
  .png()
  .toFile(path.join(output, "orthographic-project-plate.png"));

const mechanism = [];
for (const [index, [id, label]] of [["primary-core-load-path", "A · PRIMARY-CORE LOAD PATH"], ["hinge-detail", "B · ECCENTRIC LONGITUDINAL HINGE"], ["independent-tilt", "C · SIX INDEPENDENT STATES"], ["side-hover", "D · LATERAL-THRUST STATE"]].entries()) {
  const tile = await plateTile(id, label, 1200, 810);
  const left = (index % 2) * 1200;
  const top = 110 + Math.floor(index / 2) * 810;
  mechanism.push({ input: tile.render, left, top });
  mechanism.push({ input: tile.caption, left, top: top + 756 });
}
const mechanismHeader = Buffer.from(`<svg width="2400" height="110" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="50" fill="#13191c" font-family="sans-serif" font-size="34" font-weight="800">TILT HEXACOPTER B03 · MECHANISM AND LOAD-PATH PLATE</text><text x="55" y="84" fill="#556168" font-family="sans-serif" font-size="20">SEPARATE PRIMARY CORE · THREE PAIRED SLOPED AERODYNAMIC FRAMES · ECCENTRIC HINGES OUTSIDE DUCTS</text></svg>`);
await sharp({ create: { width: plateWidth, height: plateHeight, channels: 3, background: "#e7eaec" } })
  .composite([{ input: mechanismHeader, left: 0, top: 0 }, ...mechanism, { input: plateFooter, left: 0, top: 1730 }])
  .png()
  .toFile(path.join(output, "mechanism-project-plate.png"));

const core = [];
for (const [index, [id, label]] of [["primary-core-isometric", "A · ISOLATED PRIMARY CORE"], ["primary-core-load-path", "B · CORE → SPARS → ARMOUR BELTS"], ["structural-exterior", "C · CLOSED HULL"], ["structural-cutaway", "D · SAME CAMERA · HULL REMOVED"]].entries()) {
  const tile = await plateTile(id, label, 1200, 810);
  const left = (index % 2) * 1200;
  const top = 110 + Math.floor(index / 2) * 810;
  core.push({ input: tile.render, left, top });
  core.push({ input: tile.caption, left, top: top + 756 });
}
const coreHeader = Buffer.from(`<svg width="2400" height="110" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f5f6"/><text x="55" y="50" fill="#13191c" font-family="sans-serif" font-size="34" font-weight="800">TILT HEXACOPTER B03 · PRIMARY-CORE EVIDENCE PLATE</text><text x="55" y="84" fill="#556168" font-family="sans-serif" font-size="20">HULL SHELL IS NON-PRIMARY · THREE SUPPORT STATIONS PER SIDE · CLOSED/CUTAWAY CAMERA PAIR</text></svg>`);
await sharp({ create: { width: plateWidth, height: plateHeight, channels: 3, background: "#e7eaec" } })
  .composite([{ input: coreHeader, left: 0, top: 0 }, ...core, { input: plateFooter, left: 0, top: 1730 }])
  .png()
  .toFile(path.join(output, "primary-core-project-plate.png"));
