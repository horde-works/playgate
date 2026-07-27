/**
 * Несущая целостность сцены + глубокие взаимопроникновения.
 *
 * Замерять ДО правки и ПОСЛЕ: ни одно из двух чисел не должно вырасти.
 * База снимается через `git stash` (правку отложить, прогнать, вернуть).
 *
 *   node .claude/skills/world-building/scripts/check-structure.mjs [сцена] [префикс]
 *
 *   сцена   — путь модуля сцены, по умолчанию games/make-a-mess/src/game/townScene.ts
 *   префикс — фильтр id для сканирования пересечений (например hru:), по
 *             умолчанию вся сцена
 *
 * Порог глубины взят тот же, что у компилятора (deinterpenetrate.ts):
 * перекрытие считается «глубоким», если его объём > 22% объёма меньшей детали.
 * Такие пары разводятся только внутри одного кластера — межкластерные
 * остаются как есть, поэтому смотреть надо на прирост, а не на абсолют.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const VOLUME_RATIO_GATE = 0.22;
const MIN_DEPTH = 0.05;
const CELL = 3;

const [modulePath = "games/make-a-mess/src/game/townScene.ts", prefix = ""] =
  process.argv.slice(2);

const module = await import(pathToFileURL(resolve(modulePath)).href);
const scene = Object.values(module).find(
  (value) =>
    value && typeof value === "object" &&
    "breakablePieces" in value && "resolveStructuralCollapse" in value,
);
if (!scene) {
  console.error(`в ${modulePath} не нашёл сцену с breakablePieces`);
  process.exit(1);
}
console.log(`сцена ${scene.id ?? "?"}: ${scene.breakablePieces.length} деталей`);

// --- 1. Обрушения на старте -----------------------------------------------
const collapsed = [...scene.resolveStructuralCollapse(new Set())];
console.log(`\nобрушений на старте: ${collapsed.length}`);
if (collapsed.length) {
  const groups = new Map();
  for (const id of collapsed) {
    const key = id.replace(/:\d+$/, ":*").replace(/:rod:\*$/, ":rod:*");
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${n}× ${key}`);
  }
}

// --- 2. Глубокие взаимопроникновения --------------------------------------
const lo = (p, a) => p.position[a] - p.size[a] / 2;
const hi = (p, a) => p.position[a] + p.size[a] / 2;
const volume = (p) => p.size[0] * p.size[1] * p.size[2];

// Повёрнутые детали пропускаем: их осевой габарит врёт в обе стороны, честный
// AABB надо считать как |R|·size (см. transport-lessons §6).
const pieces = scene.breakablePieces.filter(
  (p) => !p.rotation && (!prefix || p.id.includes(prefix)),
);
console.log(`\nсканирую ${pieces.length} неповёрнутых деталей${prefix ? ` (префикс «${prefix}»)` : ""}`);

const grid = new Map();
for (const p of pieces) {
  for (let x = Math.floor(lo(p, 0) / CELL); x <= Math.floor(hi(p, 0) / CELL); x += 1) {
    for (let y = Math.floor(lo(p, 1) / CELL); y <= Math.floor(hi(p, 1) / CELL); y += 1) {
      for (let z = Math.floor(lo(p, 2) / CELL); z <= Math.floor(hi(p, 2) / CELL); z += 1) {
        const key = `${x}|${y}|${z}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(p);
        else grid.set(key, [p]);
      }
    }
  }
}

const seen = new Set();
const deep = [];
for (const bucket of grid.values()) {
  for (let i = 0; i < bucket.length; i += 1) {
    for (let j = i + 1; j < bucket.length; j += 1) {
      const a = bucket[i], b = bucket[j];
      const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const ov = [0, 1, 2].map(
        (k) => Math.min(hi(a, k), hi(b, k)) - Math.max(lo(a, k), lo(b, k)),
      );
      if (ov.some((v) => v <= 0)) continue;
      const ratio = (ov[0] * ov[1] * ov[2]) / Math.min(volume(a), volume(b));
      if (ratio > VOLUME_RATIO_GATE && Math.max(...ov) > MIN_DEPTH) {
        deep.push({ a: a.id, b: b.id, ratio, ov });
      }
    }
  }
}
deep.sort((x, y) => y.ratio - x.ratio);
console.log(`глубоких взаимопроникновений (>${VOLUME_RATIO_GATE * 100}%): ${deep.length}`);
for (const d of deep.slice(0, 12)) {
  console.log(
    `  ${(d.ratio * 100).toFixed(0).padStart(3)}%  ${d.a}  ×  ${d.b}` +
    `  [${d.ov.map((v) => v.toFixed(2)).join(", ")}]`,
  );
}
