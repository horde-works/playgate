import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ОТБОР ТЕСТОВ — САМ ГЕЙТ, И У ГЕЙТА ДОЛЖЕН БЫТЬ СТОРОЖ.
 *
 * `npm run test:affected` стоит на каждой правке и каждом пуше, а полный
 * прогон — только там, где отбору верить нельзя. Значит цена промаха у отбора
 * не «лишние шесть минут», а МОЛЧАНИЕ: тест, который инструмент не выбрал,
 * не существует до следующего полного прогона.
 *
 * Здесь проверяется ровно то, на чём отбор уже промолчал: сторожа, которые
 * читают исходник ГЛАЗАМИ вместо импорта. Так проверяют то, что нельзя
 * загрузить в node (React-компонент со сценой) и то, что вообще не модуль
 * (CSS, каталог ассетов). Для графа импортов такой тест выглядит одиноким.
 *
 * Замер до починки: СЕМЬ тестов читают файл литералом и один — каталог, а под
 * ними `MakeAMessGame`, `WorldEnvironment`, `TreeVisuals`,
 * `CinematicPostProcessing`, `globals.css` и сторож изоляции рантайма. Ни один
 * не выбирался НИКОГДА.
 *
 * Ещё шесть тестов собирают путь вычислением — такой путь не разрешается
 * статически, и они честно остаются на полном прогоне. Здесь они не считаются
 * и не проверяются: обещать больше, чем инструмент умеет, — это и есть способ
 * получить зелёного сторожа над дырой.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const tool = resolve(root, "tools/affected-tests.mjs");

/** Литералы `new URL("...", import.meta.url)` — то, что тест читает с диска. */
const FILE_URL = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*,?\s*\)/g;

function selectionFor(changedPath) {
  return execFileSync(process.execPath, [tool, changedPath], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readingTests() {
  return readdirSync(here)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => resolve(here, name))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .map(({ file, source }) => ({
      file,
      reads: [...source.matchAll(FILE_URL)]
        .map((match) => resolve(dirname(file), match[1]))
        .filter((target) => {
          try {
            return statSync(target).isFile();
          } catch {
            return false;
          }
        }),
    }))
    .filter(({ reads }) => reads.length > 0);
}

test("тест, читающий файл, выбирается при правке ЭТОГО файла", () => {
  const readers = readingTests();
  // Если форма чтения в проекте поменяется, тест обязан об этом сказать, а не
  // тихо проверить пустой список и позеленеть. Порог ЗАМЕРЕН: на 11.08.2026
  // таких сторожей семь, и шестёрка оставляет ровно один шаг запаса.
  assert.ok(
    readers.length >= 6,
    `сторожей, читающих файлы, найдено ${readers.length} — форма чтения изменилась?`,
  );

  const misses = [];
  for (const { file, reads } of readers) {
    const name = file.slice(root.length + 1).replaceAll(sep, "/");
    for (const target of reads) {
      const changed = target.slice(root.length + 1).replaceAll(sep, "/");
      if (!selectionFor(target).includes(name)) {
        misses.push(`${name} не выбран при правке ${changed}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});

test("отбор не выбирает всё подряд: чужая правка его не будит", () => {
  // Обратная сторона: отбор, который на всякий случай выбирает весь набор,
  // ничем не лучше отсутствия отбора. Проверяется на файле, который не читает
  // и не импортирует никто из тестов.
  const lonely = resolve(root, "README.md");
  const selected = selectionFor(lonely);
  assert.ok(
    selected.length <= 3,
    `правка README подняла ${selected.length} тестов: ${selected.slice(0, 5).join(", ")}`,
  );
});
