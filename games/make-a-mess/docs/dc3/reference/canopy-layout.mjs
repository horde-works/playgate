/**
 * Чертёж разбивки фонаря кабины DC-3 — построение ДО геометрии.
 *
 * Серым идёт то, что СНЯТО с PD-чертежа C-47 (обвод носа, габариты заливок
 * остекления, полуширина в плане). Чёрным — ПОСТРОЕНИЕ: линии стыков, стойки,
 * панели. Красным пунктиром — где остекление стояло в ревизии c4, чтобы
 * величина ошибки читалась глазом, а не на слово.
 *
 * Всё в самолётной раме, метры: fs назад от кончика носа, bl от плоскости
 * симметрии, wl вверх от горизонтали через кончик носа.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url).pathname;
const survey = JSON.parse(readFileSync(`${here}nose-survey.json`, "utf8"));

// ------------------------------------------------------------- ПОСТРОЕНИЕ
const WS = {
  baseCentre: { fs: 1.171, wl: 0.866 },
  browCentre: { fs: 1.620, wl: 1.321 },
  baseCorner: { fs: 1.400, bl: 0.600, wl: 0.720 },
  browCorner: { fs: 1.780, bl: 0.550, wl: 1.220 },
  centrePost: 0.060,
};
const CANOPY = {
  brow: { from: 1.620, to: 1.900, wlFrom: 1.321, wlTo: 1.476, half: 0.550 },
  roof: { from: 1.900, to: 2.900, wlFrom: 1.476, wlTo: 1.634, halfFrom: 0.550, halfTo: 0.750 },
  sill: { from: 1.300, to: 2.900, wlFrom: 0.720, wlTo: 0.700 },
  head: 1.050,
  panes: [
    { id: "S1", from: 1.440, to: 1.980, bl: 0.960 },
    { id: "S2", from: 2.025, to: 2.450, bl: 1.000 },
    { id: "S3", from: 2.495, to: 2.860, bl: 1.030 },
  ],
  fairingTo: 3.300,
};
const GHOST = {
  windscreen: { from: 2.36, to: 2.87, low: 1.05, high: 1.42 },
  side: { from: 2.87, to: 3.64, low: 0.70, high: 1.36 },
};
const RAKE = Math.atan2(WS.browCentre.fs - WS.baseCentre.fs, WS.browCentre.wl - WS.baseCentre.wl) * 180 / Math.PI;
const HALF_V = Math.atan2(WS.baseCorner.bl - WS.centrePost / 2, WS.baseCorner.fs - WS.baseCentre.fs) * 180 / Math.PI;

// ----------------------------------------------------------------- ЛИСТ
const SHEET = { width: 2640, height: 2000 };
const out = [];
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const line = (x1, y1, x2, y2, cls) => out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`);
const poly = (points, cls) => { if (points.length > 1) out.push(`<polyline points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" class="${cls}"/>`); };
const shape = (points, cls) => out.push(`<polygon points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" class="${cls}"/>`);
const rect = (x, y, w, h, cls) => out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.abs(w).toFixed(1)}" height="${Math.abs(h).toFixed(1)}" class="${cls}"/>`);
const text = (x, y, value, cls = "label", anchor = "start") => out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${esc(value)}</text>`);

/** Размер: выносные, размерная со штрихами, подпись всегда читаемая. */
const dim = (x1, y1, x2, y2, value, offset) => {
  const dx = x2 - x1; const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * offset; const ny = (dx / length) * offset;
  const ax = x1 + nx; const ay = y1 + ny; const bx = x2 + nx; const by = y2 + ny;
  line(x1 + nx * 0.06, y1 + ny * 0.06, ax + nx * 0.10, ay + ny * 0.10, "witness");
  line(x2 + nx * 0.06, y2 + ny * 0.06, bx + nx * 0.10, by + ny * 0.10, "witness");
  out.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" class="dim" marker-start="url(#tick)" marker-end="url(#tick)"/>`);
  let angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const mx = (ax + bx) / 2; const my = (ay + by) / 2;
  out.push(`<text x="${mx.toFixed(1)}" y="${(my - 9).toFixed(1)}" class="dimtext" text-anchor="middle" transform="rotate(${angle.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})">${esc(value)}</text>`);
};

/** Разбивает трассу на непрерывные куски: обрыв данных не должен стать линией. */
const runs = (points, maxStep) => {
  const result = []; let current = [];
  for (const point of points) {
    if (current.length && Math.hypot(point[0] - current[current.length - 1][0], point[1] - current[current.length - 1][1]) > maxStep) {
      if (current.length > 1) result.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 1) result.push(current);
  return result;
};

const frame = (x, y, w, h, title) => {
  rect(x, y, w, h, "viewbox");
  text(x + 18, y + 34, title, "viewtitle");
};

// ============================================================ 1 · СБОКУ
const V1 = { x: 130, y: 170, w: 1300, h: 860 };
frame(V1.x, V1.y, V1.w, V1.h, "1 · БОКОВАЯ ПРОЕКЦИЯ — разбивка фонаря");
const S1 = 215;
const sx = (fs) => V1.x + 100 + fs * S1;
const sy = (wl) => V1.y + 70 + (1.80 - wl) * S1;

for (let fs = 0; fs <= 4.0; fs += 0.25) {
  const heavy = Math.abs(fs % 1) < 1e-6;
  line(sx(fs), V1.y + 66, sx(fs), V1.y + 700, heavy ? "gridheavy" : "grid");
  if (Math.abs(fs % 0.5) < 1e-6) text(sx(fs), V1.y + 726, fs.toFixed(2), "tick", "middle");
}
line(sx(-0.2), sy(0), sx(4.05), sy(0), "datum");
text(sx(4.08), sy(0) + 6, "wl 0", "note");
text(sx(2.0), V1.y + 756, "станция fs, м — назад от кончика носа", "note", "middle");

const crownPoints = survey.profile.filter((r) => r.topFs <= 4.0).map((r) => [sx(r.topFs), sy(r.topWl)]);
for (const part of runs(crownPoints, 70)) poly(part, "traced");
const keelPoints = survey.profile.filter((r) => r.bottomFs <= 4.0 && r.bottomWl > -1.10).map((r) => [sx(r.bottomFs), sy(r.bottomWl)]);
for (const part of runs(keelPoints, 70)) poly(part, "traced");
text(sx(3.05), sy(1.80), "обвод носа снят с чертежа", "tracedlabel");
text(sx(1.55), sy(-0.98) + 24, "низ фюзеляжа", "tracedlabel", "middle");

rect(sx(GHOST.windscreen.from), sy(GHOST.windscreen.high), (GHOST.windscreen.to - GHOST.windscreen.from) * S1, (GHOST.windscreen.high - GHOST.windscreen.low) * S1, "ghost");
rect(sx(GHOST.side.from), sy(GHOST.side.high), (GHOST.side.to - GHOST.side.from) * S1, (GHOST.side.high - GHOST.side.low) * S1, "ghost");
text(sx(3.70), sy(1.42) + 22, "остекление в c4", "ghostlabel", "end");

const sillAt = (fs) => CANOPY.sill.wlFrom + (CANOPY.sill.wlTo - CANOPY.sill.wlFrom) * (fs - CANOPY.sill.from) / (CANOPY.sill.to - CANOPY.sill.from);
line(sx(1.20), sy(0.724), sx(3.05), sy(0.698), "control");
text(sx(3.08), sy(0.698) + 6, "подоконная линия — ПРЯМАЯ", "controllabel");

shape([[sx(WS.baseCentre.fs), sy(WS.baseCentre.wl)], [sx(WS.browCentre.fs), sy(WS.browCentre.wl)],
  [sx(WS.browCorner.fs), sy(WS.browCorner.wl)], [sx(WS.baseCorner.fs), sy(WS.baseCorner.wl)]], "glass");
text(sx(0.62), sy(1.42), "W · лобовое", "panel");
line(sx(1.02), sy(1.40), sx(1.34), sy(1.14), "witness");
poly([[sx(CANOPY.brow.from), sy(CANOPY.brow.wlFrom)], [sx(CANOPY.brow.to), sy(CANOPY.brow.wlTo)],
  [sx(CANOPY.roof.to), sy(CANOPY.roof.wlTo)], [sx(CANOPY.fairingTo), sy(1.664)]], "member");
text(sx(1.58), sy(1.63), "BR · козырёк", "panel");
text(sx(2.32), sy(1.80), "RF · крыша кабины", "panel");
text(sx(3.10), sy(1.60), "FR · зализ", "panel");

for (const pane of CANOPY.panes) {
  rect(sx(pane.from), sy(CANOPY.head), (pane.to - pane.from) * S1, (CANOPY.head - sillAt(pane.from)) * S1, "glass");
  text(sx((pane.from + pane.to) / 2), sy(CANOPY.head) - 14, pane.id, "panel", "middle");
}
for (let index = 0; index < CANOPY.panes.length - 1; index += 1) {
  const a = CANOPY.panes[index].to; const b = CANOPY.panes[index + 1].from;
  rect(sx(a), sy(CANOPY.head), (b - a) * S1, (CANOPY.head - sillAt(a)) * S1, "post");
}
rect(sx(WS.baseCorner.fs), sy(CANOPY.head), (CANOPY.panes[0].from - WS.baseCorner.fs) * S1, (CANOPY.head - 0.72) * S1, "post");
text(sx(1.42), sy(0.60) + 20, "P-K · угловая стойка", "note", "middle");

const dimRow = V1.y + 800;
dim(sx(0), dimRow, sx(WS.baseCentre.fs), dimRow, "1.17 — нос до лобового", 0);
dim(sx(WS.baseCentre.fs), dimRow + 44, sx(GHOST.windscreen.from), dimRow + 44, "+1.19 — ошибка c4", 0);
dim(sx(CANOPY.sill.from), sy(0.72), sx(2.86), sy(0.705), "1.56 — длина остекления", 128);
dim(sx(3.42), sy(0.70), sx(3.42), sy(CANOPY.head), "0.33 — высота окна", 0);
dim(sx(3.88), sy(0.70), sx(3.88), sy(1.634), "0.93 — гребень над подоконником", 0);
const rx = sx(WS.baseCentre.fs); const ry = sy(WS.baseCentre.wl);
line(rx, ry, rx, ry - 168, "witness");
out.push(`<path d="M ${rx.toFixed(1)} ${(ry - 112).toFixed(1)} A 112 112 0 0 1 ${(rx + 112 * Math.sin(RAKE * Math.PI / 180)).toFixed(1)} ${(ry - 112 * Math.cos(RAKE * Math.PI / 180)).toFixed(1)}" class="dim"/>`);
text(rx + 18, ry - 132, `${RAKE.toFixed(0)}° наклон лобового`, "dimtext");

// ============================================================ 2 · ПЛАН
const V2 = { x: 1470, y: 170, w: 1040, h: 860 };
frame(V2.x, V2.y, V2.w, V2.h, "2 · ПЛАН — фонарь на обводе носа");
const S2 = 215;
const px = (fs) => V2.x + 90 + fs * S2;
const py = (bl) => V2.y + 70 + (1.30 + bl) * S2;
for (let fs = 0; fs <= 3.75; fs += 0.25) {
  const heavy = Math.abs(fs % 1) < 1e-6;
  line(px(fs), V2.y + 66, px(fs), V2.y + 630, heavy ? "gridheavy" : "grid");
  if (Math.abs(fs % 0.5) < 1e-6) text(px(fs), V2.y + 660, fs.toFixed(2), "tick", "middle");
}
line(px(-0.15), py(0), px(3.85), py(0), "datum");
const half = survey.planHalf.filter((r) => r.fs <= 2.70 && r.half < 1.25);
poly(half.map((r) => [px(r.fs), py(r.half)]), "traced");
poly(half.map((r) => [px(r.fs), py(-r.half)]), "traced");
text(px(1.90), py(1.22) + 26, "полуширина фюзеляжа снята с чертежа", "tracedlabel", "middle");

shape([[px(CANOPY.brow.from), py(CANOPY.brow.half)], [px(CANOPY.roof.to), py(CANOPY.roof.halfTo)],
  [px(CANOPY.fairingTo), py(0.06)], [px(CANOPY.fairingTo), py(-0.06)],
  [px(CANOPY.roof.to), py(-CANOPY.roof.halfTo)], [px(CANOPY.brow.from), py(-CANOPY.brow.half)]], "roofoutline");
text(px(2.36), py(-0.42), "RF · крыша", "panel", "middle");
for (const side of [-1, 1]) {
  shape([[px(WS.baseCentre.fs), py(side * WS.centrePost / 2)], [px(WS.baseCorner.fs), py(side * WS.baseCorner.bl)],
    [px(WS.browCorner.fs), py(side * WS.browCorner.bl)], [px(WS.browCentre.fs), py(side * WS.centrePost / 2)]], "glass");
  for (const pane of CANOPY.panes) {
    rect(px(pane.from), py(side * pane.bl), (pane.to - pane.from) * S2, side * 0.055 * S2, "glass");
  }
}
line(px(WS.baseCentre.fs), py(0), px(WS.browCentre.fs), py(0), "memberheavy");
text(px(1.40), py(0.36), "W-R", "panel", "middle");
text(px(1.40), py(-0.28), "W-L", "panel", "middle");
text(px(1.66), py(-0.14), "P-C", "note", "middle");
dim(px(WS.baseCorner.fs), py(-WS.baseCorner.bl), px(WS.baseCorner.fs), py(WS.baseCorner.bl), "1.20 — лобовое по низу", 200);
dim(px(2.86), py(-1.03), px(2.86), py(1.03), "2.06 — по задним окнам", -160);
text(px(0.16), py(-1.06), "нос выходит на полную ширину", "note");
text(px(0.16), py(-0.94), "за 1.5 м станции", "note");

// ============================================================ 3 · СПЕРЕДИ
const V3 = { x: 130, y: 1080, w: 700, h: 820 };
frame(V3.x, V3.y, V3.w, V3.h, "3 · ВИД СПЕРЕДИ — лобовое стекло");
const S3 = 250;
const fx = (bl) => V3.x + 350 + bl * S3;
const fy = (wl) => V3.y + 120 + (1.55 - wl) * S3;
const secTop = 0.90; const secBottom = -0.74; const secHalf = 0.80;
const secCentre = (secTop + secBottom) / 2;
const arc = [];
for (let index = 0; index <= 60; index += 1) {
  const angle = -Math.PI + (index / 60) * Math.PI * 2;
  const cos = Math.cos(angle);
  arc.push([fx(secHalf * Math.sin(angle)), fy(secCentre + (cos >= 0 ? secTop - secCentre : secCentre - secBottom) * cos)]);
}
poly(arc, "traced");
text(fx(0), fy(-0.86), "сечение фюзеляжа на станции 1.25", "tracedlabel", "middle");
for (const side of [-1, 1]) {
  shape([[fx(side * WS.centrePost / 2), fy(WS.baseCentre.wl)], [fx(side * WS.baseCorner.bl), fy(WS.baseCorner.wl)],
    [fx(side * WS.browCorner.bl), fy(WS.browCorner.wl)], [fx(side * WS.centrePost / 2), fy(WS.browCentre.wl)]], "glass");
}
rect(fx(-WS.centrePost / 2), fy(WS.browCentre.wl), WS.centrePost * S3, (WS.browCentre.wl - WS.baseCentre.wl) * S3, "post");
text(fx(0), fy(1.44), "P-C · стойка 60 мм", "note", "middle");
text(fx(-0.36), fy(1.02), "W-L", "panel", "middle");
text(fx(0.36), fy(1.02), "W-R", "panel", "middle");
dim(fx(-WS.baseCorner.bl), fy(0.72), fx(WS.baseCorner.bl), fy(0.72), "1.20", 120);
dim(fx(0.92), fy(0.72), fx(0.92), fy(WS.browCentre.wl), "0.60", 0);
text(fx(-0.98), fy(0.55), "низ лобового = подоконная линия", "note", "start");

// ============================================================ 4 · СЕЧЕНИЕ
const V4 = { x: 870, y: 1080, w: 700, h: 820 };
frame(V4.x, V4.y, V4.w, V4.h, "4 · СЕЧЕНИЕ A–A по wl 0.88");
const S4 = 205;
const cx = (bl) => V4.x + 350 + bl * S4;
const cy = (fs) => V4.y + 130 + (fs - 1.05) * S4;
line(cx(0), cy(1.05), cx(0), cy(3.05), "datum");
for (const side of [-1, 1]) {
  poly([[cx(side * WS.centrePost / 2), cy(WS.baseCentre.fs)], [cx(side * WS.baseCorner.bl), cy(WS.baseCorner.fs)],
    [cx(side * CANOPY.panes[0].bl), cy(CANOPY.panes[0].from)], [cx(side * CANOPY.panes[2].bl), cy(CANOPY.panes[2].to)]], "memberheavy");
}
const cheek = survey.planHalf.filter((r) => r.fs >= 1.0 && r.fs <= 2.72 && r.half < 1.25);
poly(cheek.map((r) => [cx(r.half), cy(r.fs)]), "traced");
poly(cheek.map((r) => [cx(-r.half), cy(r.fs)]), "traced");
text(cx(0), cy(1.02) - 12, "нос", "note", "middle");
text(cx(0.24), cy(1.30), `V ${(90 - HALF_V).toFixed(0)}°`, "dimtext");
text(cx(0.36), cy(2.40), "щека — боковые окна", "note");
text(cx(-1.30), cy(2.90), "серым — борт с чертежа", "tracedlabel");

// ============================================================ 5 · ВЕДОМОСТЬ
const V5 = { x: 1610, y: 1080, w: 900, h: 820 };
frame(V5.x, V5.y, V5.w, V5.h, "5 · ВЕДОМОСТЬ ПАНЕЛЕЙ");
const rows = [
  ["id", "что", "станции fs", "bl", "wl", "материал"],
  ["W-L / W-R", "лобовое, плоское", "1.17 → 1.62", "0…±0.60", "0.87 → 1.32", "glazing"],
  ["P-C", "центральная стойка", "1.17 → 1.62", "±0.03", "0.87 → 1.32", "metal"],
  ["P-K ×2", "угловая стойка", "1.40 → 1.78", "±0.60", "0.72 → 1.22", "metal"],
  ["BR", "козырёк", "1.62 → 1.90", "±0.55", "1.32 → 1.48", "metal"],
  ["RF", "крыша кабины", "1.90 → 2.90", "±0.55…0.75", "1.48 → 1.63", "paint-light"],
  ["S1 ×2", "боковое окно 1", "1.44 → 1.98", "±0.96", "0.72 → 1.05", "glazing"],
  ["S2 ×2", "боковое окно 2", "2.03 → 2.45", "±1.00", "0.72 → 1.05", "glazing"],
  ["S3 ×2", "боковое окно 3", "2.50 → 2.86", "±1.03", "0.72 → 1.05", "glazing"],
  ["FR", "зализ в гребень", "2.90 → 3.30", "±0.75 → 0", "1.63 → 1.66", "paint-light"],
];
const colX = [22, 152, 372, 542, 662, 800];
rows.forEach((row, index) => {
  const y = V5.y + 88 + index * 40;
  if (index === 0) line(V5.x + 18, y + 12, V5.x + V5.w - 18, y + 12, "control");
  row.forEach((cell, column) => text(V5.x + colX[column], y, cell, index === 0 ? "th" : "td"));
});
const notes = [
  "Что меняется против c4:",
  "· остекление уходит ВПЕРЁД на 1.19 м",
  "· лобовое перестаёт быть лентой по сечению",
  "  и становится плоской парой панелей,",
  "· подоконная линия — прямая; гребень над ней",
  "  поднимается на 0.93 м, окна остаются на месте.",
];
notes.forEach((note, index) => text(V5.x + 22, V5.y + 580 + index * 34, note, index === 0 ? "th" : "td"));

// ------------------------------------------------------------------ ЛИСТ
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}" height="${SHEET.height}" viewBox="0 0 ${SHEET.width} ${SHEET.height}">
<defs><marker id="tick" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
<path d="M 3 3 L 9 9" stroke="#1d2226" stroke-width="1.6"/></marker></defs>
<style>
  text{font-family:"Helvetica Neue",Arial,sans-serif;fill:#1d2226}
  .viewbox{fill:#ffffff;stroke:#c3c9cc;stroke-width:1.4}
  .grid{stroke:#e6e9ea;stroke-width:1}
  .gridheavy{stroke:#ccd2d5;stroke-width:1.2}
  .datum{stroke:#8d979c;stroke-width:1.1;stroke-dasharray:18 6 4 6}
  .traced{stroke:#9aa3a8;stroke-width:2.4;fill:none;stroke-linejoin:round}
  .ghost{fill:none;stroke:#c0736b;stroke-width:1.8;stroke-dasharray:8 6}
  .control{stroke:#1d2226;stroke-width:1.6;stroke-dasharray:14 5 4 5}
  .member{stroke:#1d2226;stroke-width:3.4;fill:none;stroke-linejoin:round}
  .memberheavy{stroke:#1d2226;stroke-width:4.6;fill:none;stroke-linejoin:round}
  .glass{fill:#cddfe8;stroke:#1d2226;stroke-width:2.4}
  .roofplan{fill:#eceeef;stroke:#1d2226;stroke-width:2.2}
  .roofoutline{fill:none;stroke:#1d2226;stroke-width:2.6;stroke-dasharray:none}
  .post{fill:#79838a;stroke:#1d2226;stroke-width:1.4}
  .dim{stroke:#1d2226;stroke-width:1.3;fill:none}
  .witness{stroke:#9aa3a8;stroke-width:1}
  .dimtext{font-size:20px}
  .label{font-size:20px}
  .note{font-size:18px;fill:#5d666b}
  .controllabel{font-size:18px;fill:#1d2226;font-weight:700}
  .tick{font-size:17px;fill:#5d666b}
  .panel{font-size:21px;font-weight:700}
  .viewtitle{font-size:25px;font-weight:700;letter-spacing:0.03em}
  .tracedlabel{font-size:18px;fill:#8d979c}
  .ghostlabel{font-size:18px;fill:#c0736b}
  .th{font-size:19px;font-weight:700}
  .td{font-size:19px;fill:#31383c}
  .title{font-size:34px;font-weight:700;letter-spacing:0.02em}
  .sub{font-size:20px;fill:#5d666b}
</style>
<rect width="100%" height="100%" fill="#f5f6f7"/>
<text x="130" y="80" class="title">DOUGLAS DC-3 · ФОНАРЬ КАБИНЫ — РАЗБИВКА ПЕРЕД ПОСТРОЕНИЕМ</text>
<text x="130" y="118" class="sub">самолётная рама, метры · серое — снято с PD-чертежа C-47 · чёрное — построение · красный пунктир — где остекление стояло в ревизии c4</text>
<line x1="130" y1="140" x2="${SHEET.width - 130}" y2="140" stroke="#1d2226" stroke-width="2"/>
${out.join("\n")}
<line x1="130" y1="${SHEET.height - 70}" x2="${SHEET.width - 130}" y2="${SHEET.height - 70}" stroke="#c3c9cc" stroke-width="1"/>
<text x="130" y="${SHEET.height - 36}" class="sub">обвод: File:Douglas C-47 Skytrain drawings.svg, общественное достояние · масштаб только с напечатанных размеров DC-3 · наклон лобового ${RAKE.toFixed(1)}° от вертикали, полуугол V ${(90 - HALF_V).toFixed(0)}°</text>
</svg>`;

writeFileSync(`${here}../canopy-layout.svg`, svg);
await sharp(Buffer.from(svg), { density: 132 }).png().toFile(`${here}../canopy-layout.png`);
console.log(`наклон лобового ${RAKE.toFixed(2)}°, полуугол V ${(90 - HALF_V).toFixed(1)}°`);
console.log("written docs/dc3/canopy-layout.svg + .png");
