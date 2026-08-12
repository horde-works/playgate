#!/usr/bin/env node
/**
 * КАКИЕ ТЕСТЫ ВООБЩЕ МОГУТ УПАСТЬ ОТ ЭТОЙ ПРАВКИ.
 *
 * Полный прогон здесь идёт пять-шесть минут. Гонять его на каждую мелочь —
 * не осторожность, а потеря времени: тест, который не импортирует изменённый
 * файл ни прямо, ни через цепочку, упасть от него не может по построению.
 *
 * Инструмент строит граф импортов от каждого `tests/*.test.mjs` вниз по
 * относительным путям (node_modules не трогаются) и печатает те тесты, чьё
 * замыкание пересекается с изменёнными файлами. Дальше:
 *
 *     node --test $(node tools/affected-tests.mjs)
 *
 * ЧЕСТНАЯ ГРАНИЦА ИНСТРУМЕНТА. Он видит только статические импорты, поэтому:
 *
 *   - правка ОБЩЕГО контракта (`vehicleFrames`, `destructionRuntime`,
 *     `destructionScene`, `motionRoute`, `clusterDynamics`) сама собой
 *     вытянет почти весь набор — и это правильный ответ, а не недостаток;
 *   - правка данных, которые читаются не импортом (JSON сцен, ассеты), сюда
 *     не попадёт: для таких изменений отбор не применяют;
 *   - от общего прогона ПЕРЕД ПУШЕМ он не освобождает. Он освобождает от него
 *     на каждом шаге внутри работы.
 *
 * Без аргументов берёт `git diff --name-only HEAD` плюс неотслеживаемые файлы:
 * то есть всё, что изменено с последнего коммита.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RUN_FLAG = "--run";
const runRequested = process.argv.includes(RUN_FLAG);

function changedFiles() {
  const fromArgs = process.argv.slice(2).filter((arg) => arg !== RUN_FLAG);
  if (fromArgs.length > 0) {
    return fromArgs.map((name) => resolve(root, name));
  }
  const run = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return [
    ...run(["diff", "--name-only", "HEAD"]),
    ...run(["ls-files", "--others", "--exclude-standard"]),
  ].map((name) => resolve(root, name));
}

/**
 * Три формы, и ни одна не ограничена длиной.
 *
 * Первая версия искала `import ... from` окном в двести символов и молча
 * теряла длинные многострочные списки: тест воздушного боя не попадал в отбор
 * при правке маршрутов, хотя зависит от них через паспорт машин. Отбор,
 * который иногда недобирает, хуже отсутствия отбора — на него полагаешься.
 */
const FROM_PATTERN = /\bfrom\s*["']([^"']+)["']/g;
const DYNAMIC_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const BARE_PATTERN = /^\s*import\s+["']([^"']+)["']/gm;

/**
 * ЧЕТВЁРТАЯ ФОРМА ЗАВИСИМОСТИ: ФАЙЛ, КОТОРЫЙ ТЕСТ ЧИТАЕТ, А НЕ ИМПОРТИРУЕТ.
 *
 * Часть сторожей смотрит на исходник ГЛАЗАМИ, а не через импорт: так проверяют
 * то, что нельзя загрузить в node (React-компонент со сценой), и то, что
 * вообще не модуль (CSS, лицензии, каталоги ассетов). Для графа импортов такой
 * тест выглядит одиноким, его замыкание — он сам, и правка охраняемого файла
 * НИКОГДА его не выберет.
 *
 * Цена этой слепоты замерена: СЕМЬ тестов читают файл литералом и ОДИН —
 * каталог целиком, а под ними `MakeAMessGame`, `WorldEnvironment`,
 * `TreeVisuals`, `CinematicPostProcessing`, `globals.css` и сторож изоляции
 * рантайма. То есть ровно те файлы, которые нечем покрыть иначе, охранялись
 * тестами, молчащими на каждом шаге работы и оживающими только в
 * шестиминутном прогоне. Отбор, который иногда недобирает, хуже отсутствия
 * отбора — на него полагаешься.
 *
 * ГРАНИЦА И ЗДЕСЬ ЧЕСТНАЯ: литерал обязан быть литералом. Ещё шесть тестов
 * собирают путь вычислением (`new URL(\`../public${x}\`, ...)`), и такой путь
 * не разрешается статически ни этим инструментом, ни любым другим — они
 * остаются на полном прогоне. Сторож самого отбора —
 * `tests/affected-tests-selection.test.mjs`.
 */
const FILE_URL_PATTERN =
  /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*,?\s*\)/g;

/** Разрешает относительный импорт в файл на диске; чужое — null. */
function resolveImport(specifier, fromFile) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith("/")) ?? null;
}

/**
 * Путь из `new URL(...)` — относительно САМОГО ФАЙЛА и без угадывания
 * расширений: тут написан ровно тот путь, который читают, а не спецификатор
 * модуля. Каталог возвращается тоже: он значит «всё, что внутри».
 */
function resolveRead(literal, fromFile) {
  const target = resolve(dirname(fromFile), literal);
  return existsSync(target) ? target : null;
}

const importCache = new Map();
/** Каталоги, читаемые тестом целиком: `тест → [абсолютный префикс]`. */
const readDirs = new Map();

function importsOf(file) {
  const cached = importCache.get(file);
  if (cached) {
    return cached;
  }
  let source = "";
  try {
    source = readFileSync(file, "utf8");
  } catch {
    importCache.set(file, []);
    return [];
  }
  const found = new Set();
  for (const pattern of [FROM_PATTERN, DYNAMIC_PATTERN, BARE_PATTERN]) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveImport(match[1], file);
      if (resolved) {
        found.add(resolved);
      }
    }
  }
  for (const match of source.matchAll(FILE_URL_PATTERN)) {
    const target = resolveRead(match[1], file);
    if (!target) {
      continue;
    }
    if (statSync(target).isDirectory()) {
      const dirs = readDirs.get(file) ?? [];
      dirs.push(target);
      readDirs.set(file, dirs);
    } else {
      found.add(target);
    }
  }
  const list = [...found];
  importCache.set(file, list);
  return list;
}

/** Полное замыкание импортов теста. */
function closureOf(entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    for (const next of importsOf(queue.pop())) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const changed = new Set(changedFiles());
const testsDir = resolve(root, "tests");
const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => resolve(testsDir, name));

const affected = testFiles.filter((test) => {
  // Изменился сам тест — он в отборе без разговоров.
  if (changed.has(test)) {
    return true;
  }
  const closure = closureOf(test);
  for (const file of changed) {
    if (closure.has(file)) {
      return true;
    }
  }
  // Каталог, читаемый целиком, означает «любой файл внутри».
  const watched = [...closure].flatMap((file) => readDirs.get(file) ?? []);
  for (const file of changed) {
    if (watched.some((dir) => file.startsWith(`${dir}${sep}`))) {
      return true;
    }
  }
  return false;
});

if (process.env.AFFECTED_TESTS_VERBOSE) {
  process.stderr.write(
    `изменено файлов: ${changed.size}; затронуто тестов: ${affected.length} из ${testFiles.length}\n`,
  );
}

const names = affected.map((file) =>
  relative(root, file).replaceAll("\\", "/"),
);

if (!runRequested) {
  process.stdout.write(names.join("\n"));
  if (names.length > 0) {
    process.stdout.write("\n");
  }
} else if (names.length === 0) {
  // Ноль затронутых — это ответ, а не повод молча ничего не сделать.
  process.stdout.write(
    "Затронутых тестов нет: правка не входит ни в один граф импортов.\n",
  );
} else {
  process.stdout.write(
    `Затронуто тестов: ${names.length} из ${testFiles.length}\n`,
  );
  const result = spawnSync(process.execPath, ["--test", ...names], {
    cwd: root,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}
