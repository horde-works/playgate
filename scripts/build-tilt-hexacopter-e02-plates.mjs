import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("games/make-a-mess/docs/tilt-hexacopter/e02-systems");
const W = 3000;
const H = 2100;
const HEADER = 138;
const FOOTER = 250;
const CW = 1500;
const CH = (H - HEADER - FOOTER) / 2;
const BODY_H = CH - 62;
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svg = (w, h, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`);

const header = (title, subtitle) => svg(W, HEADER, `
  <rect width="${W}" height="${HEADER}" fill="#f2f4f5"/><rect width="18" height="${HEADER}" fill="#cf8832"/>
  <text x="58" y="58" fill="#151b1e" font-family="Arial,sans-serif" font-size="38" font-weight="800">TILT HEXACOPTER · ${esc(title)}</text>
  <text x="58" y="101" fill="#536068" font-family="Arial,sans-serif" font-size="22">${esc(subtitle)}</text>
  <text x="2860" y="60" text-anchor="end" fill="#151b1e" font-family="Arial,sans-serif" font-size="26" font-weight="800">REV E02</text>
  <text x="2860" y="98" text-anchor="end" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="700">SYSTEM PACKAGING</text>
  <line x1="0" y1="137" x2="3000" y2="137" stroke="#20272b" stroke-width="2"/>
`);
const footer = (drawing, notes) => svg(W, FOOTER, `
  <rect width="${W}" height="${FOOTER}" fill="#f2f4f5" stroke="#20272b" stroke-width="2"/>
  <line x1="2050" y1="0" x2="2050" y2="250" stroke="#20272b" stroke-width="2"/><line x1="2510" y1="0" x2="2510" y2="250" stroke="#20272b" stroke-width="2"/><line x1="2050" y1="84" x2="3000" y2="84" stroke="#20272b" stroke-width="2"/><line x1="2050" y1="168" x2="3000" y2="168" stroke="#20272b" stroke-width="2"/>
  <text x="38" y="43" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="800">NOTES / LEGEND</text>
  ${notes.map((note, i) => `<text x="38" y="${79 + i * 34}" fill="#48545b" font-family="Arial,sans-serif" font-size="19">${i + 1}. ${esc(note)}</text>`).join("")}
  <circle cx="1040" cy="44" r="9" fill="#d68b2a"/><text x="1058" y="51" fill="#48545b" font-family="Arial,sans-serif" font-size="18">ENERGY / HV / ACTUATION</text>
  <circle cx="1360" cy="44" r="9" fill="#2782a6"/><text x="1378" y="51" fill="#48545b" font-family="Arial,sans-serif" font-size="18">COOLING</text>
  <circle cx="1555" cy="44" r="9" fill="#747e83"/><text x="1573" y="51" fill="#48545b" font-family="Arial,sans-serif" font-size="18">CREW / AVIONICS</text>
  <text x="2080" y="30" fill="#667178" font-family="Arial,sans-serif" font-size="16">DRAWING</text><text x="2080" y="66" fill="#151b1e" font-family="Arial,sans-serif" font-size="29" font-weight="800">${drawing}</text>
  <text x="2540" y="30" fill="#667178" font-family="Arial,sans-serif" font-size="16">STATUS</text><text x="2540" y="66" fill="#9a5c16" font-family="Arial,sans-serif" font-size="21" font-weight="800">NOT FOR MANUFACTURE</text>
  <text x="2080" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">UNITS / SCALE</text><text x="2080" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="22" font-weight="700">METRES / NTS</text>
  <text x="2540" y="116" fill="#667178" font-family="Arial,sans-serif" font-size="16">EXTERIOR</text><text x="2540" y="151" fill="#151b1e" font-family="Arial,sans-serif" font-size="20" font-weight="700">B11 FROZEN</text>
  <text x="2080" y="205" fill="#667178" font-family="Arial,sans-serif" font-size="16">DATE</text><text x="2080" y="235" fill="#151b1e" font-family="Arial,sans-serif" font-size="20">2026-08-16</text>
  <text x="2540" y="205" fill="#667178" font-family="Arial,sans-serif" font-size="16">SYSTEMS</text><text x="2540" y="235" fill="#151b1e" font-family="Arial,sans-serif" font-size="20">E02 HYPOTHESIS</text>
`);
const caption = (label, right) => svg(CW, 62, `<rect width="${CW}" height="62" fill="#151b1e"/><text x="24" y="40" fill="#f4f6f7" font-family="Arial,sans-serif" font-size="25" font-weight="800">${esc(label)}</text><text x="${CW - 24}" y="40" text-anchor="end" fill="#d7a157" font-family="Arial,sans-serif" font-size="21" font-weight="700">${esc(right)}</text>`);
const imagePanel = async (id, label, right) => ({
  body: await sharp(path.join(output, `${id}.png`)).extract({ left: 0, top: 78, width: 1600, height: 836 }).resize(CW, BODY_H, { fit: "contain", background: "#e6e9eb" }).png().toBuffer(),
  cap: caption(label, right),
});
const diagramPanel = (label, right, content) => ({ body: svg(CW, BODY_H, `<rect width="${CW}" height="${BODY_H}" fill="#e6e9eb"/>${content}`), cap: caption(label, right) });
const box = (x, y, w, h, label, fill = "#ffffff", stroke = "#30383d") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="3"/><text x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="20" font-weight="700">${label}</text>`;
const arrow = (x1, y1, x2, y2, color = "#566168") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="5"/><polygon points="${x2},${y2} ${x2 - 15},${y2 - 9} ${x2 - 15},${y2 + 9}" fill="${color}"/>`;

const makePlate = async ({ file, title, subtitle, panels, notes }) => {
  const resolved = [];
  for (const panel of panels) resolved.push(await panel);
  const composites = [{ input: header(title, subtitle), left: 0, top: 0 }];
  resolved.forEach((panel, index) => {
    const left = (index % 2) * CW;
    const top = HEADER + Math.floor(index / 2) * CH;
    composites.push({ input: panel.body, left, top }, { input: panel.cap, left, top: top + BODY_H });
  });
  composites.push({ input: footer(file.split("-").slice(0, 2).join("-"), notes), left: 0, top: H - FOOTER });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#e6e9eb" } }).composite(composites).png().toFile(path.join(output, file));
};

await makePlate({
  file: "SYS-05-internal-arrangement.png",
  title: "INTERNAL SYSTEMS ARRANGEMENT",
  subtitle: "TANDEM CREW CELL · SIX ENERGY MODULES · DUAL POWER / COOLING TRUNKS · LOCAL RING ACTUATION",
  panels: [
    imagePanel("systems-cutaway", "A · COMPLETE CUTAWAY", "B11 EXTERIOR REMOVED"),
    imagePanel("systems-isometric", "B · ISOLATED PACKAGING", "CORE + SYSTEMS"),
    imagePanel("systems-plan", "C · DISTRIBUTION PLAN", "6 ENERGY MODULES"),
    imagePanel("crew-cell-profile", "D · CREW / AVIONICS PROFILE", "2 TANDEM STATIONS")
  ],
  notes: [
    "All E02 components fit inside the accepted B11 exterior and remain separate from the primary cage.",
    "Forward avionics is isolated ahead of the two-seat survival cell; energy storage occupies the central core bay.",
    "Quantities and zones are fixed for review; masses, chemistry, voltages and certified clearances remain unresolved."
  ]
});

const powerFlow = `
  <text x="55" y="58" fill="#20272b" font-family="Arial,sans-serif" font-size="25" font-weight="800">FUNCTIONAL POWER FLOW — NO VOLTAGE RATING ASSIGNED</text>
  ${box(70,135,280,90,"6× ENERGY MODULE", "#efc27a", "#b36d1f")}
  ${box(465,135,250,90,"PDU A / PDU B", "#f5f6f7")}
  ${box(850,80,260,80,"3× LEFT LIFT", "#dce3e6")}${box(850,190,260,80,"3× RIGHT LIFT", "#dce3e6")}
  ${box(1190,80,240,80,"2× AXIAL FAN", "#dce3e6")}${box(1190,190,240,80,"6× ACTUATOR", "#efc27a", "#b36d1f")}
  ${arrow(350,180,465,180,"#d68b2a")}${arrow(715,180,850,120,"#d68b2a")}${arrow(715,180,850,230,"#d68b2a")}${arrow(1110,120,1190,120,"#d68b2a")}${arrow(1110,230,1190,230,"#d68b2a")}
  <rect x="465" y="330" width="645" height="150" rx="14" fill="#f5f6f7" stroke="#48545b" stroke-width="3"/><text x="787" y="375" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="22" font-weight="800">CROSS-TIE POLICY</text><text x="787" y="415" text-anchor="middle" fill="#536068" font-family="Arial,sans-serif" font-size="19">normally split left / right · supervised tie for degraded operation</text><text x="787" y="450" text-anchor="middle" fill="#9a5c16" font-family="Arial,sans-serif" font-size="18">contactors, protection curves and fault energy not yet sized</text>
`;
const failureDomains = `
  <text x="55" y="58" fill="#20272b" font-family="Arial,sans-serif" font-size="25" font-weight="800">FAULT-CONTAINMENT DOMAINS</text>
  ${box(95,110,580,100,"DOMAIN A · LEFT LIFT / BUS A", "#f5f6f7")}${box(825,110,580,100,"DOMAIN B · RIGHT LIFT / BUS B", "#f5f6f7")}
  ${box(95,285,580,100,"CENTRAL ENERGY BAY · 3 PAIRED ROWS", "#efc27a", "#b36d1f")}${box(825,285,580,100,"FLIGHT-CONTROL / ACTUATOR LV BUS", "#f5f6f7")}
  <line x1="675" y1="160" x2="825" y2="160" stroke="#d68b2a" stroke-width="7" stroke-dasharray="18 12"/><text x="750" y="145" text-anchor="middle" fill="#9a5c16" font-family="Arial,sans-serif" font-size="17">CONTROLLED TIE</text>
  <text x="750" y="470" text-anchor="middle" fill="#536068" font-family="Arial,sans-serif" font-size="20">No single local hinge actuator belongs to the fixed armour load path.</text>
`;
await makePlate({
  file: "ELEC-06-power-architecture.png",
  title: "ELECTRICAL POWER ARCHITECTURE",
  subtitle: "DUAL LONGITUDINAL DISTRIBUTION · LEFT/RIGHT FAULT DOMAINS · SIX LOCAL ACTUATORS",
  panels: [
    imagePanel("systems-plan", "A · PHYSICAL DISTRIBUTION", "TWIN LONGITUDINAL BUSES"),
    imagePanel("actuator-layout", "B · LOCAL ACTUATOR LAYOUT", "6 REPLACEABLE UNITS"),
    diagramPanel("C · FUNCTIONAL POWER FLOW", "RATING TBD", powerFlow),
    diagramPanel("D · FAILURE DOMAINS", "CROSS-TIE SUPERVISED", failureDomains)
  ],
  notes: [
    "Power architecture is intentionally split left/right; the centre cross-tie is a degraded-mode path, not a common bus.",
    "Each ring actuator and controller is local to its eccentric hinge; moving rings do not carry belt loads.",
    "Voltage, conductor section, contactors, protection curves, EMC and emergency energy are open engineering items."
  ]
});

const coolingLoop = `
  <text x="55" y="58" fill="#20272b" font-family="Arial,sans-serif" font-size="25" font-weight="800">DUAL LIQUID LOOP — FUNCTIONAL SCHEME</text>
  ${box(80,130,220,80,"PUMP L", "#d8edf5", "#2782a6")}${box(80,300,220,80,"PUMP R", "#d8edf5", "#2782a6")}
  ${box(415,100,270,80,"ENERGY COLD PLATES", "#f5f6f7")}${box(415,215,270,80,"AVIONICS / PDU", "#f5f6f7")}${box(415,330,270,80,"MOTOR BRANCHES", "#f5f6f7")}
  ${box(850,130,260,80,"HEAT EXCHANGER L", "#d8edf5", "#2782a6")}${box(850,300,260,80,"HEAT EXCHANGER R", "#d8edf5", "#2782a6")}
  ${arrow(300,170,415,140,"#2782a6")}${arrow(300,340,415,370,"#2782a6")}${arrow(685,140,850,170,"#2782a6")}${arrow(685,370,850,340,"#2782a6")}
  <path d="M1110 170 C1270 170 1270 340 1110 340" fill="none" stroke="#2782a6" stroke-width="5" stroke-dasharray="16 10"/><text x="1270" y="265" fill="#536068" font-family="Arial,sans-serif" font-size="18">ISOLATED BYPASS</text>
`;
const thermalZones = `
  <text x="55" y="58" fill="#20272b" font-family="Arial,sans-serif" font-size="25" font-weight="800">LONGITUDINAL THERMAL ZONING</text>
  <polygon points="90,270 250,190 520,190 570,270 520,350 250,350" fill="#dce3e6" stroke="#48545b" stroke-width="3"/>
  <rect x="570" y="190" width="390" height="160" fill="#efc27a" stroke="#b36d1f" stroke-width="3"/>
  <polygon points="960,190 1280,210 1410,270 1280,330 960,350" fill="#d8edf5" stroke="#2782a6" stroke-width="3"/>
  <text x="330" y="277" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="22" font-weight="800">CREW / AVIONICS</text><text x="765" y="277" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="22" font-weight="800">ENERGY BAY</text><text x="1165" y="277" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="22" font-weight="800">REJECTION / ENGINES</text>
  <text x="750" y="455" text-anchor="middle" fill="#536068" font-family="Arial,sans-serif" font-size="19">Fire barriers, coolant chemistry, ram-air area and hover heat-rejection margin remain unresolved.</text>
`;
await makePlate({
  file: "THM-07-thermal-management.png",
  title: "THERMAL MANAGEMENT",
  subtitle: "PAIRED SUPPLY / RETURN TRUNKS · TWO PUMPS · TWO AFT HEAT EXCHANGERS · ZONED HEAT SOURCES",
  panels: [
    imagePanel("systems-isometric", "A · COOLANT TRUNKS IN CORE", "2 SUPPLY + 2 RETURN"),
    imagePanel("systems-plan", "B · PHYSICAL ROUTING", "AFT HEAT REJECTION"),
    diagramPanel("C · DUAL LOOP SCHEME", "CROSS-BYPASS ISOLATED", coolingLoop),
    diagramPanel("D · THERMAL ZONES", "FRONT → REAR", thermalZones)
  ],
  notes: [
    "Two physically separated liquid loops serve energy modules, avionics/PDU and propulsion branches.",
    "Heat exchangers and pumps sit aft of the energy bay and remain accessible with the upper engine armour removed.",
    "Heat loads, coolant, radiator area, hover rejection and fire barriers are deliberately not claimed at E02."
  ]
});

const serviceZones = `
  <text x="55" y="58" fill="#20272b" font-family="Arial,sans-serif" font-size="25" font-weight="800">SERVICE-ZONE MAP — PLAN</text>
  <polygon points="80,285 180,190 1320,190 1420,285 1320,380 180,380" fill="#f5f6f7" stroke="#30383d" stroke-width="4"/>
  <rect x="170" y="215" width="250" height="140" fill="#dce3e6" stroke="#48545b" stroke-width="3"/><rect x="420" y="215" width="390" height="140" fill="#d5dde1" stroke="#48545b" stroke-width="3"/><rect x="810" y="215" width="300" height="140" fill="#efc27a" stroke="#b36d1f" stroke-width="3"/><rect x="1110" y="215" width="220" height="140" fill="#d8edf5" stroke="#2782a6" stroke-width="3"/>
  <text x="295" y="280" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="20" font-weight="800">AVIONICS</text><text x="615" y="280" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="20" font-weight="800">CREW CELL</text><text x="960" y="280" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="20" font-weight="800">ENERGY</text><text x="1220" y="280" text-anchor="middle" fill="#20272b" font-family="Arial,sans-serif" font-size="20" font-weight="800">THERMAL</text>
  <path d="M295 215 V120 M615 215 V120 M960 355 V455 M1220 355 V455" stroke="#d68b2a" stroke-width="5"/><polygon points="295,105 284,125 306,125" fill="#d68b2a"/><polygon points="615,105 604,125 626,125" fill="#d68b2a"/><polygon points="960,470 949,450 971,450" fill="#d68b2a"/><polygon points="1220,470 1209,450 1231,450" fill="#d68b2a"/>
  <text x="750" y="535" text-anchor="middle" fill="#536068" font-family="Arial,sans-serif" font-size="19">Access-door geometry, handling equipment and removal clearances require the next joint/detail gate.</text>
`;
await makePlate({
  file: "SRV-08-access-maintenance.png",
  title: "ACCESS AND MAINTENANCE ZONES",
  subtitle: "FORWARD AVIONICS · TOP CREW ACCESS · LOWER ENERGY CASSETTES · AFT THERMAL SERVICE",
  panels: [
    imagePanel("systems-cutaway", "A · SYSTEMS IN INSTALLED STATE", "SHELL REMOVED"),
    imagePanel("crew-cell-profile", "B · CREW / FORWARD SERVICE", "TANDEM CELL"),
    imagePanel("actuator-layout", "C · HINGE-LINE SERVICE", "6 LOCAL MODULES"),
    diagramPanel("D · SERVICE-ZONE MAP", "ACCESS DIRECTION HYPOTHESIS", serviceZones)
  ],
  notes: [
    "Service zoning keeps crew, energy and thermal work separated along the vehicle length.",
    "Local hinge actuators are replaceable without removing the static armour belts or disturbing the primary core.",
    "Panel cuts, connectors, lifting points, extraction paths and maintenance clearances remain for detail engineering."
  ]
});

const sheets = ["SYS-05-internal-arrangement.png", "ELEC-06-power-architecture.png", "THM-07-thermal-management.png", "SRV-08-access-maintenance.png"];
const overview = [];
for (const [index, file] of sheets.entries()) {
  const thumb = await sharp(path.join(output, file)).resize(1200, 840, { fit: "contain", background: "#e6e9eb" }).png().toBuffer();
  overview.push({ input: thumb, left: (index % 2) * 1200, top: Math.floor(index / 2) * 840 });
}
await sharp({ create: { width: 2400, height: 1680, channels: 3, background: "#e6e9eb" } }).composite(overview).png().toFile(path.join(output, "E02-overview.png"));
process.stdout.write("built SYS-05, ELEC-06, THM-07, SRV-08 and E02 overview\n");
