import path from "node:path";
import sharp from "sharp";

import { tiltHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";

const output = path.resolve("games/make-a-mess/docs/tilt-hexacopter/e01-engineering/SEC-04-structural-sections.png");
const W = 3000;
const H = 2100;
const HEADER = 138;
const FOOTER = 250;
const CW = 1500;
const CH = (H - HEADER - FOOTER) / 2;
const EPS = 1e-7;

const stations = [
  { id: "A–A", z: 2.50, role: "FORWARD LIFT-RING STATION" },
  { id: "B–B", z: 1.25, role: "FORWARD BELT SUPPORT FRAME" },
  { id: "C–C", z: -1.25, role: "MID BELT SUPPORT FRAME" },
  { id: "D–D", z: -3.72, role: "TERMINAL SUPPORT / REAR ARMOUR" }
];

const styles = {
  "hull-shell": ["#20282d", 4.2],
  canopy: ["#23718e", 3.2],
  "dorsal-hump": ["#273137", 4.0],
  "primary-core": ["#d0842d", 4.4],
  "belt-spars": ["#778188", 4.2],
  "belt-sockets": ["#9a692f", 3.5],
  "armour-belt-left": ["#141a1d", 5.4],
  "armour-belt-right": ["#141a1d", 5.4],
  "hinge-carriers": ["#a0752e", 3.1],
  "longitudinal-engines": ["#6b7479", 3.4],
  "engine-armour": ["#343d42", 3.6]
};

const styleFor = (group) => group.startsWith("tilt-ring-") ? ["#427d9b", 3.3] : styles[group];
const unique = (points) => {
  const seen = new Map();
  for (const point of points) seen.set(`${point[0].toFixed(7)},${point[1].toFixed(7)}`, point);
  return [...seen.values()];
};
const interpolate = (a, b, z) => {
  const t = (z - a[2]) / (b[2] - a[2]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
const triangleSegments = (vertices, triangle, z) => {
  const p = triangle.map((index) => vertices[index]);
  if (p.every((point) => Math.abs(point[2] - z) <= EPS)) {
    return [[[p[0][0], p[0][1]], [p[1][0], p[1][1]]], [[p[1][0], p[1][1]], [p[2][0], p[2][1]]], [[p[2][0], p[2][1]], [p[0][0], p[0][1]]]];
  }
  const hits = [];
  for (const [a, b] of [[p[0], p[1]], [p[1], p[2]], [p[2], p[0]]]) {
    const da = a[2] - z;
    const db = b[2] - z;
    if (Math.abs(da) <= EPS) hits.push([a[0], a[1]]);
    if (da * db < -EPS * EPS) hits.push(interpolate(a, b, z));
  }
  const points = unique(hits);
  return points.length === 2 ? [[points[0], points[1]]] : [];
};

const sectionSegments = (z) => {
  const segments = [];
  for (const part of tiltHexacopterObject.parts) {
    const style = styleFor(part.group);
    if (!style || part.kind !== "mesh") continue;
    for (const triangle of part.triangles) {
      for (const [a, b] of triangleSegments(part.vertices, triangle, z)) segments.push({ a, b, style, group: part.group });
    }
  }
  return segments;
};

const sectionSvg = (station) => {
  const segments = sectionSegments(station.z);
  const scale = 150;
  const cx = CW / 2;
  const groundY = 650;
  const tx = ([x]) => cx + x * scale;
  const ty = (([, y]) => groundY - y * scale);
  const lines = segments.map(({ a, b, style }) => `<line x1="${tx(a).toFixed(1)}" y1="${ty(a).toFixed(1)}" x2="${tx(b).toFixed(1)}" y2="${ty(b).toFixed(1)}" stroke="${style[0]}" stroke-width="${style[1]}" stroke-linecap="round"/>`).join("");
  const grid = Array.from({ length: 9 }, (_, index) => {
    const x = cx + (index - 4) * scale;
    return `<line x1="${x}" y1="95" x2="${x}" y2="680" stroke="#cbd1d4" stroke-width="1"/><text x="${x}" y="710" text-anchor="middle" fill="#7a858b" font-family="Arial,sans-serif" font-size="16">${index - 4}</text>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
    <rect width="${CW}" height="${CH}" fill="#e7eaec"/>
    ${grid}
    <line x1="70" y1="${groundY}" x2="1430" y2="${groundY}" stroke="#7a858b" stroke-width="2"/>
    <line x1="${cx}" y1="70" x2="${cx}" y2="690" stroke="#c4873c" stroke-width="2" stroke-dasharray="12 9"/>
    ${lines}
    <rect x="0" y="${CH - 62}" width="${CW}" height="62" fill="#151b1e"/>
    <text x="24" y="${CH - 22}" fill="#f4f6f7" font-family="Arial,sans-serif" font-size="25" font-weight="800">${station.id} · z=${station.z.toFixed(2)} m</text>
    <text x="${CW - 24}" y="${CH - 22}" text-anchor="end" fill="#d7a157" font-family="Arial,sans-serif" font-size="21" font-weight="700">${station.role}</text>
  </svg>`);
};

const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEADER}">
  <rect width="${W}" height="${HEADER}" fill="#f2f4f5"/><rect width="18" height="${HEADER}" fill="#cf8832"/>
  <text x="58" y="58" fill="#151b1e" font-family="Arial,sans-serif" font-size="38" font-weight="800">TILT HEXACOPTER · STRUCTURAL SECTIONS</text>
  <text x="58" y="101" fill="#536068" font-family="Arial,sans-serif" font-size="22">TRUE TRIANGLE/PLANE INTERSECTIONS FROM THE B11 CANONICAL MESH · VIEW FORWARD (+Z)</text>
  <text x="2860" y="60" text-anchor="end" fill="#151b1e" font-family="Arial,sans-serif" font-size="26" font-weight="800">REV E01</text>
  <text x="2860" y="98" text-anchor="end" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="700">DESIGN DEVELOPMENT</text>
</svg>`);
const footer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${FOOTER}">
  <rect width="${W}" height="${FOOTER}" fill="#f2f4f5" stroke="#20272b" stroke-width="2"/>
  <text x="38" y="44" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="800">SECTION LEGEND</text>
  <line x1="42" y1="80" x2="112" y2="80" stroke="#20282d" stroke-width="6"/><text x="130" y="87" fill="#48545b" font-family="Arial,sans-serif" font-size="20">HULL / DORSAL ARMOUR</text>
  <line x1="420" y1="80" x2="490" y2="80" stroke="#d0842d" stroke-width="6"/><text x="508" y="87" fill="#48545b" font-family="Arial,sans-serif" font-size="20">PRIMARY CORE</text>
  <line x1="755" y1="80" x2="825" y2="80" stroke="#778188" stroke-width="6"/><text x="843" y="87" fill="#48545b" font-family="Arial,sans-serif" font-size="20">STATIC SPARS</text>
  <line x1="1080" y1="80" x2="1150" y2="80" stroke="#427d9b" stroke-width="6"/><text x="1168" y="87" fill="#48545b" font-family="Arial,sans-serif" font-size="20">MOVING DUCTS</text>
  <text x="38" y="139" fill="#58646b" font-family="Arial,sans-serif" font-size="19">Section lines are exact intersections of the emitted faceted parts; no illustrative replacement geometry is used.</text>
  <text x="38" y="176" fill="#58646b" font-family="Arial,sans-serif" font-size="19">Member thicknesses are design-development hypotheses. Joint detailing, tolerances and load sizing are not released.</text>
  <rect x="2050" y="0" width="950" height="250" fill="none" stroke="#20272b" stroke-width="2"/>
  <line x1="2510" y1="0" x2="2510" y2="250" stroke="#20272b" stroke-width="2"/><line x1="2050" y1="84" x2="3000" y2="84" stroke="#20272b" stroke-width="2"/><line x1="2050" y1="168" x2="3000" y2="168" stroke="#20272b" stroke-width="2"/>
  <text x="2080" y="30" fill="#667178" font-family="Arial,sans-serif" font-size="16">DRAWING</text><text x="2080" y="66" fill="#151b1e" font-family="Arial,sans-serif" font-size="29" font-weight="800">SEC-04</text>
  <text x="2540" y="30" fill="#667178" font-family="Arial,sans-serif" font-size="16">STATUS</text><text x="2540" y="66" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="800">NOT FOR MANUFACTURE</text>
  <text x="2080" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">UNITS / SCALE</text><text x="2080" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="700">METRES / NTS</text>
  <text x="2540" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">GEOMETRY</text><text x="2540" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="20" font-weight="700">B11 FROZEN</text>
  <text x="2080" y="205" fill="#667178" font-family="Arial,sans-serif" font-size="16">DATE</text><text x="2080" y="235" fill="#151b1e" font-family="Arial,sans-serif" font-size="20">2026-08-16</text>
  <text x="2540" y="205" fill="#667178" font-family="Arial,sans-serif" font-size="16">REVISION</text><text x="2540" y="235" fill="#151b1e" font-family="Arial,sans-serif" font-size="20">E01</text>
</svg>`);

const composites = [{ input: header, left: 0, top: 0 }];
for (const [index, station] of stations.entries()) composites.push({ input: sectionSvg(station), left: (index % 2) * CW, top: HEADER + Math.floor(index / 2) * CH });
composites.push({ input: footer, left: 0, top: H - FOOTER });
await sharp({ create: { width: W, height: H, channels: 3, background: "#e7eaec" } }).composite(composites).png().toFile(output);
process.stdout.write(`built ${output}\n`);
