import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("games/make-a-mess/docs/tilt-hexacopter/e01-engineering");
const W = 3000;
const H = 2100;
const HEADER = 138;
const FOOTER = 250;
const CELL_W = W / 2;
const CELL_H = (H - HEADER - FOOTER) / 2;
const BODY_H = CELL_H - 62;

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svg = (width, height, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);

const header = (drawing, subtitle) => svg(W, HEADER, `
  <rect width="${W}" height="${HEADER}" fill="#f2f4f5"/>
  <rect x="0" y="0" width="18" height="${HEADER}" fill="#cf8832"/>
  <text x="58" y="58" fill="#151b1e" font-family="Arial,sans-serif" font-size="38" font-weight="800">TILT HEXACOPTER · ${esc(drawing)}</text>
  <text x="58" y="101" fill="#536068" font-family="Arial,sans-serif" font-size="22">${esc(subtitle)}</text>
  <text x="2860" y="60" text-anchor="end" fill="#151b1e" font-family="Arial,sans-serif" font-size="26" font-weight="800">REV E01</text>
  <text x="2860" y="98" text-anchor="end" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="700">DESIGN DEVELOPMENT</text>
  <line x1="0" y1="137" x2="3000" y2="137" stroke="#20272b" stroke-width="2"/>
`);

const footer = (drawingNo, notes) => svg(W, FOOTER, `
  <rect width="${W}" height="${FOOTER}" fill="#f2f4f5" stroke="#20272b" stroke-width="2"/>
  <line x1="2050" y1="0" x2="2050" y2="250" stroke="#20272b" stroke-width="2"/>
  <line x1="2510" y1="0" x2="2510" y2="250" stroke="#20272b" stroke-width="2"/>
  <line x1="2050" y1="84" x2="3000" y2="84" stroke="#20272b" stroke-width="2"/>
  <line x1="2050" y1="168" x2="3000" y2="168" stroke="#20272b" stroke-width="2"/>
  <text x="38" y="43" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="700">NOTES</text>
  ${notes.map((note, index) => `<text x="38" y="${79 + index * 34}" fill="#48545b" font-family="Arial,sans-serif" font-size="19">${index + 1}. ${esc(note)}</text>`).join("")}
  <text x="2080" y="32" fill="#667178" font-family="Arial,sans-serif" font-size="16">DRAWING</text>
  <text x="2080" y="67" fill="#151b1e" font-family="Arial,sans-serif" font-size="29" font-weight="800">${esc(drawingNo)}</text>
  <text x="2540" y="32" fill="#667178" font-family="Arial,sans-serif" font-size="16">STATUS</text>
  <text x="2540" y="66" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="800">NOT FOR MANUFACTURE</text>
  <text x="2080" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">UNITS / SCALE</text>
  <text x="2080" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="700">METRES / NTS</text>
  <text x="2540" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">GEOMETRY</text>
  <text x="2540" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="20" font-weight="700">B11 FROZEN</text>
  <text x="2080" y="203" fill="#667178" font-family="Arial,sans-serif" font-size="16">DATE</text>
  <text x="2080" y="235" fill="#151b1e" font-family="Arial,sans-serif" font-size="20">2026-08-16</text>
  <text x="2540" y="203" fill="#667178" font-family="Arial,sans-serif" font-size="16">MODEL</text>
  <text x="2540" y="235" fill="#151b1e" font-family="monospace" font-size="17">1b7cd34f46cd…</text>
`);

const tile = async (id, label, dimension, width = CELL_W, height = CELL_H) => {
  await fs.access(path.join(output, `${id}.png`));
  const body = await sharp(path.join(output, `${id}.png`))
    .extract({ left: 0, top: 78, width: 1600, height: 836 })
    .resize(Math.round(width), Math.round(height - 62), { fit: "contain", background: "#e6e9eb" })
    .png().toBuffer();
  const cap = svg(width, 62, `
    <rect width="${width}" height="62" fill="#151b1e"/>
    <text x="24" y="39" fill="#f4f6f7" font-family="Arial,sans-serif" font-size="24" font-weight="800">${esc(label)}</text>
    <text x="${width - 24}" y="39" text-anchor="end" fill="#d7a157" font-family="Arial,sans-serif" font-size="21" font-weight="700">${esc(dimension)}</text>
  `);
  return { body, cap };
};

const makePlate = async ({ file, drawing, subtitle, panels, notes }) => {
  const composites = [{ input: header(drawing, subtitle), left: 0, top: 0 }];
  for (const [index, panel] of panels.entries()) {
    const panelTile = await tile(...panel);
    const left = (index % 2) * CELL_W;
    const top = HEADER + Math.floor(index / 2) * CELL_H;
    composites.push({ input: panelTile.body, left, top });
    composites.push({ input: panelTile.cap, left, top: top + BODY_H });
  }
  composites.push({ input: footer(file.replace(".png", ""), notes), left: 0, top: H - FOOTER });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#e6e9eb" } })
    .composite(composites).png().toFile(path.join(output, file));
};

await makePlate({
  file: "GA-01-general-arrangement.png",
  drawing: "GENERAL ARRANGEMENT",
  subtitle: "ORTHOGRAPHIC ENVELOPE · ONE CANONICAL B11 GEOMETRY · +Z FORWARD · +Y UP",
  panels: [
    ["top", "A · PLAN", "11.000 L × 8.590 W"],
    ["front", "B · FRONT", "8.590 W × 2.940 H"],
    ["left", "C · PORT PROFILE", "11.000 L × 2.940 H"],
    ["rear", "D · REAR", "REINFORCED BELT TERMINATION"]
  ],
  notes: [
    "Overall envelope is recovered from emitted geometry; no drawing-only scaling.",
    "Six independent lift ducts Ø2.100 on 2.500 longitudinal pitch; two upper longitudinal engines.",
    "All dimensions are authored design hypotheses pending propulsion, load and human-factors studies."
  ]
});

await makePlate({
  file: "STR-02-primary-structure.png",
  drawing: "PRIMARY STRUCTURE AND LOAD PATH",
  subtitle: "EXTERIOR SHELL ≠ PRIMARY CORE · STATIC BELTS BYPASS ALL MOVING LIFT RINGS",
  panels: [
    ["structural-exterior", "A · COMPLETE EXTERIOR", "SHELL CLOSED"],
    ["structural-cutaway", "B · SAME CAMERA CUTAWAY", "SHELL / CANOPY HIDDEN"],
    ["primary-core-isometric", "C · ISOLATED PRIMARY CORE", "9.005 L × 1.780 W × 1.220 H"],
    ["primary-core-load-path", "D · CORE → SPARS → BELTS", "3 PAIRED SUPPORT STATIONS"]
  ],
  notes: [
    "Primary cage carries the centreline keel, dorsal member, four longerons, transverse frames and tail boom.",
    "Three aerodynamic box spars per side rise outward from the lower core into fixed armour-belt sockets.",
    "Shell is treated as non-primary at this gate; section sizing and joints remain unresolved."
  ]
});

await makePlate({
  file: "KIN-03-lift-ring-kinematics.png",
  drawing: "LIFT-RING KINEMATICS",
  subtitle: "SIX INDEPENDENT ECCENTRIC LONGITUDINAL HINGES · STATIC EXTERIOR IMPACT BELTS",
  panels: [
    ["hinge-detail", "A · ECCENTRIC HINGE DETAIL", "PIVOT OFFSET 1.170"],
    ["independent-tilt", "B · INDEPENDENT PHASES", "6 SEPARATE AXES"],
    ["side-hover", "C · LATERAL-THRUST STATE", "DEMO 82°"],
    ["belt-load-path", "D · STATIC BYPASS", "HINGE RANGE −8°…+92°"]
  ],
  notes: [
    "Each hinge axis is parallel to the fuselage and tangent outside the ring; no axis crosses a fan hub.",
    "The complete duct, rotor and hub articulate as one group; armour belts remain fixed.",
    "Motion envelope is kinematic only: actuator torque, bearing size, stops and failure modes are not yet sized."
  ]
});

const overviewIds = [
  ["front-three-quarter", "FRONT 3/4"], ["rear-three-quarter", "REAR 3/4"], ["top", "PLAN"], ["left", "PROFILE"],
  ["primary-core-isometric", "PRIMARY CORE"], ["primary-core-load-path", "LOAD PATH"], ["hinge-detail", "HINGE"], ["independent-tilt", "INDEPENDENT TILT"],
  ["structural-exterior", "EXTERIOR"], ["structural-cutaway", "CUTAWAY"], ["dorsal-profile", "DORSAL FLOW"], ["reference-match", "REFERENCE MATCH"]
];
const OW = 2400;
const OCW = 600;
const OCH = 385;
const overviewComposites = [];
for (const [index, [id, label]] of overviewIds.entries()) {
  const image = await sharp(path.join(output, `${id}.png`)).extract({ left: 0, top: 78, width: 1600, height: 836 })
    .resize(OCW, OCH - 44, { fit: "cover" }).png().toBuffer();
  const left = (index % 4) * OCW;
  const top = Math.floor(index / 4) * OCH;
  overviewComposites.push({ input: image, left, top });
  overviewComposites.push({ input: svg(OCW, 44, `<rect width="${OCW}" height="44" fill="#151b1e"/><text x="18" y="30" fill="#f2f4f5" font-family="Arial,sans-serif" font-size="20" font-weight="700">${label}</text>`), left, top: top + OCH - 44 });
}
await sharp({ create: { width: OW, height: OCH * 3, channels: 3, background: "#e6e9eb" } })
  .composite(overviewComposites).png().toFile(path.join(output, "E01-overview.png"));

process.stdout.write("built GA-01, STR-02, KIN-03 and E01 overview\n");
