import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Проект разрабатывается с двух машин, чьи чекауты лежат по разным путям:
// /Users/kirisyuk/cursor/playgate против C:\Users\IgorKirisyuk\cursor\playgate.
// Код, в котором прибит абсолютный путь одной из них, на второй машине не
// мёртв наполовину — он мёртв целиком, и молча.
//
// Так уже случилось семь раз. Шесть черновиков в корне (gap/gate/glare/
// ranges/weep-stand/weep-why.mjs) импортировали модули по абсолютному
// маковому пути и на Windows не запускались вовсе; документ польдера ссылался
// на картинку в ~/Downloads. Отдельно — заглушка скилла с маковым путём,
// которая перекрывала репозиторный скилл по имени и оставляла вторую машину с
// МЕНЬШИМ, чем без неё.
//
// Образец, на который равняться, в репозитории уже есть:
// scripts/object-lab-capture.mjs ищет Chrome через переменную окружения
// PLAYGATE_CHROME, затем список кандидатов ОБЕИХ платформ с existsSync.
// Проба и переопределение, а не «определи машину и разветвись»: определение
// машины опирается на редактируемую конфигурацию, а проба — на факт.
//
// ГРАНИЦА ТЕСТА. Бьём по исполняемым файлам, где абсолютный путь — это
// поведение. Markdown не проверяем намеренно: разбор такого инцидента обязан
// цитировать путь, которым он вызван, и запрет на прозу сделал бы
// документирование граблей невозможным.

const CODE_EXTENSIONS = /\.(mjs|cjs|js|jsx|ts|tsx|sh|ps1|py)$/;

// Обёртка `winrun` — единственный файл, где путь машины и есть поведение: это
// значение по умолчанию, к которому она уходит без PLAYGATE_REPO. Файл без
// расширения и под скан не попадает, но исключение объявлено явно, чтобы
// переименование в winrun.sh не сделало тест внезапно красным на том, что в
// нём правильно.
const ALLOWED = new Set(["tools/winrun"]);

/** Домашние каталоги обеих машин проекта. */
const MACHINE_LOCAL_ROOTS = [
  { pattern: /\/Users\/[A-Za-z0-9._-]+\//g, machine: "Mac" },
  { pattern: /[Cc]:\\+Users\\+[A-Za-z0-9._-]+\\+/g, machine: "Windows" },
];

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

test("исполняемые файлы не прибиты к домашнему каталогу одной машины", () => {
  const offenders = [];

  for (const file of trackedFiles) {
    if (!CODE_EXTENSIONS.test(file) || ALLOWED.has(file)) continue;
    // Сам этот тест обязан содержать образцы, которые ищет.
    if (file === "tests/portable-paths.test.mjs") continue;

    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const { pattern, machine } of MACHINE_LOCAL_ROOTS) {
      pattern.lastIndex = 0;
      const hit = pattern.exec(text);
      if (!hit) continue;
      const line = text.slice(0, hit.index).split("\n").length;
      offenders.push(`${file}:${line} — путь ${machine} (${hit[0]}…)`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "абсолютный путь домашнего каталога в исполняемом файле — на второй" +
      " машине это мёртвый код:\n  " +
      offenders.join("\n  ") +
      "\nЛечение: относительный импорт от файла, либо переменная окружения с" +
      " кандидатами обеих платформ и проверкой existsSync — образец в" +
      " scripts/object-lab-capture.mjs.",
  );
});
