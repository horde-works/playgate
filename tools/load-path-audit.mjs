/**
 * ПУТЬ НАГРУЗКИ: на чём физически стоит тяжёлое.
 *
 *   node tools/load-path-audit.mjs [сцена|all] [--top 12]
 *
 * Ищет тяжёлые куски, под которыми нет ничего, кроме хлипкого — дерева,
 * стекла, ткани, пластика. Класс, который находят дети и не находит ничто
 * другое: щели нет, обрушения нет, тест зелёный, а бетонная плита стоит на
 * оконной раме.
 *
 * Почему ни одна существующая проверка его не видит:
 *
 *   - `joint-audit` меряет СТЫК. Здесь стык безупречен: плита лежит на раме
 *     вплотную, ни щели, ни наложения;
 *   - структурный решатель меряет ОБРУШЕНИЕ, и возразить ему нечем: в его
 *     таблице материалов стекло прочнее бетона на сжатие (180 против 132), а
 *     дерево — как кирпич (62). Абсурд не в мегапаскалях: окно не бывает
 *     простенком, и числом это не выражается;
 *   - и обрушения-то нет. У лестничной клетки хрущёвки пояса держались
 *     боковой привязкой к фасаду: можно выбить ВСЕ стёкла лестницы, и не
 *     упадёт ничего. Неправдоподобен был только вид.
 *
 * Поэтому мера здесь — геометрическая и независимая: что физически находится
 * под куском, безотносительно того, что об этом думает решатель.
 *
 * ДВЕ ПОПРАВКИ, БЕЗ КОТОРЫХ ИЗМЕРИТЕЛЬ ВРЁТ:
 *
 *   1. ЧИТАТЬ ОБЪЯВЛЕННУЮ МАССУ, А НЕ НАЗВАНИЕ МАТЕРИАЛА. У навеса небесного
 *      тарана материал `graphiteStone`, но `volume: 0.055` при габарите
 *      0.46 м³ — автор объявил тонкую облицовку, и опора ей нужна другая.
 *      Без поправки измеритель обвинял правильно собранную деталь.
 *   2. ОПОРА БЫВАЕТ НЕ ТОЛЬКО СНИЗУ. Панель, вставленная МЕЖДУ простенками,
 *      опирается торцами, и под ней может не быть ничего — это нормальная
 *      панельная стена, а не дефект. Сосед считается опорой, если идёт вдоль
 *      куска по высоте и продолжается НИЖЕ его низа: тогда это стойка, а не
 *      случайная деталь рядом.
 *
 * Находки — не приговор, а вопрос «объясни путь нагрузки» (см.
 * `architectural-authoring.md` §11.1). Бетонная ступень на деревянном полу
 * старого дома правдоподобна; бетонный пояс в 1.19 м³ на оконной раме — нет.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadScene, sceneNames } from "./joint-audit.mjs";

const HEAVY = new Set(["concrete", "stone", "brick", "basalt", "graphiteStone"]);
const FLIMSY = new Set(["wood", "glass", "darkGlass", "plastic", "cloth"]);
/** Ниже этого объёма деталь — реквизит, а не масса. */
const MIN_VOLUME = 0.15;
/** Допуск решателя на вертикальный зазор у бетона. */
const BEARING_GAP = 0.2;
/** Каменной опоры меньше этого — считай, что её нет. */
const STRONG_AREA_MIN = 0.02;
const CELL = 3;

const argv = process.argv.slice(2);
const flagIndex = argv.indexOf("--top");
const top = flagIndex < 0 ? 12 : Number(argv[flagIndex + 1]);
const target = argv.find((value, index) =>
  !value.startsWith("--") && argv[index - 1] !== "--top") ?? "all";

const lo = (piece, axis) => piece.position[axis] - piece.size[axis] / 2;
const hi = (piece, axis) => piece.position[axis] + piece.size[axis] / 2;

function auditLoadPaths(name, scene) {
  const pieces = scene.breakablePieces;
  const grid = new Map();
  pieces.forEach((piece, index) => {
    for (let x = Math.floor(lo(piece, 0) / CELL); x <= Math.floor(hi(piece, 0) / CELL); x += 1) {
      for (let z = Math.floor(lo(piece, 2) / CELL); z <= Math.floor(hi(piece, 2) / CELL); z += 1) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      }
    }
  });

  const found = [];
  for (const piece of pieces) {
    if (!HEAVY.has(piece.material) || piece.foundation) continue;
    const volume = piece.volume
      ?? (piece.size[0] * piece.size[1] * piece.size[2]);
    if (volume < MIN_VOLUME) continue;

    const candidates = new Set();
    for (let x = Math.floor(lo(piece, 0) / CELL); x <= Math.floor(hi(piece, 0) / CELL); x += 1) {
      for (let z = Math.floor(lo(piece, 2) / CELL); z <= Math.floor(hi(piece, 2) / CELL); z += 1) {
        for (const index of grid.get(`${x},${z}`) ?? []) candidates.add(index);
      }
    }

    const height = hi(piece, 1) - lo(piece, 1);
    let beneathStrong = 0;
    let flanking = 0;
    const weak = [];
    for (const index of candidates) {
      const other = pieces[index];
      if (other.id === piece.id) continue;

      const gap = lo(piece, 1) - hi(other, 1);
      if (gap >= -0.05 && gap <= BEARING_GAP) {
        const overlapX = Math.min(hi(piece, 0), hi(other, 0)) - Math.max(lo(piece, 0), lo(other, 0));
        const overlapZ = Math.min(hi(piece, 2), hi(other, 2)) - Math.max(lo(piece, 2), lo(other, 2));
        if (overlapX > 0 && overlapZ > 0) {
          if (FLIMSY.has(other.material)) weak.push(`${other.material} ${other.id}`);
          else beneathStrong += overlapX * overlapZ;
        }
      }

      // Стойка сбоку: идёт вдоль куска и продолжается ниже его низа.
      if (FLIMSY.has(other.material)) continue;
      const shared = Math.min(hi(piece, 1), hi(other, 1)) - Math.max(lo(piece, 1), lo(other, 1));
      if (shared < height * 0.6) continue;
      if (lo(other, 1) > lo(piece, 1) - 0.3) continue;
      const gapX = Math.max(lo(piece, 0), lo(other, 0)) - Math.min(hi(piece, 0), hi(other, 0));
      const gapZ = Math.max(lo(piece, 2), lo(other, 2)) - Math.min(hi(piece, 2), hi(other, 2));
      if (gapX < 0.05 && gapZ < 0.05) flanking += 1;
    }

    if (weak.length && beneathStrong < STRONG_AREA_MIN && flanking === 0) {
      found.push({ piece, weak, volume });
    }
  }
  return { name, id: scene.id, pieces: pieces.length, found };
}

const chosen = target === "all" ? sceneNames : [target];
let total = 0;
for (const key of chosen) {
  const report = auditLoadPaths(key, await loadScene(key));
  total += report.found.length;
  console.log(`\n=== ${report.name} (${report.id}) — ${report.pieces} кусков ===`);
  console.log(`  тяжёлых кусков без каменной опоры: ${report.found.length}`);
  const groups = new Map();
  for (const entry of report.found) {
    const key2 = entry.piece.id.replace(/:-?\d+(\.\d+)?(?=(:|$))/g, ":*");
    if (!groups.has(key2)) groups.set(key2, []);
    groups.get(key2).push(entry);
  }
  for (const [key2, bucket] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, top)) {
    const entry = bucket[0];
    console.log(`  ${String(bucket.length).padStart(4)}× ${key2}`
      + `  [${entry.piece.material}, ${entry.volume.toFixed(2)} м³]`);
    console.log(`          на: ${entry.weak.slice(0, 2).join(" | ")}`);
  }
  if (groups.size > top) console.log(`    … ещё ${groups.size - top} групп`);
}
console.log(`\n=== ИТОГО: ${total} ===`);
