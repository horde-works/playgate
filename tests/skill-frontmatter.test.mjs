import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

// Скиллы читаются загрузчиками, чья строгость к YAML различается: на одной
// машине невалидный frontmatter схлопывался до имени скилла и терял ВСЕ
// триггеры, на другой — грузился целиком. Расхождение было невидимым с обеих
// сторон, поэтому валидность проверяется тестом, а не глазами.
//
// Практический случай: описание, записанное плоским скаляром, содержало
// "subsystem: cluster membership". Плоский YAML-скаляр не может содержать ": ".
// Лечение — блочный скаляр (description: >-).

const SKILLS_DIR = join(process.cwd(), ".claude", "skills");

const skillDirs = readdirSync(SKILLS_DIR).filter((name) =>
  statSync(join(SKILLS_DIR, name)).isDirectory(),
);

test("skill frontmatter parses as YAML and carries name + description", () => {
  assert.ok(skillDirs.length > 0, "не найдено ни одного скилла");

  const broken = [];

  for (const dir of skillDirs) {
    const path = join(SKILLS_DIR, dir, "SKILL.md");
    const text = readFileSync(path, "utf8");

    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      broken.push(`${dir}: нет frontmatter между --- и ---`);
      continue;
    }

    let front;
    try {
      front = load(match[1]);
    } catch (err) {
      broken.push(`${dir}: YAML не парсится — ${err.message}`);
      continue;
    }

    if (!front || typeof front !== "object") {
      broken.push(`${dir}: frontmatter не является отображением`);
      continue;
    }
    if (typeof front.name !== "string" || front.name.length === 0) {
      broken.push(`${dir}: отсутствует name`);
    }
    if (typeof front.description !== "string" || front.description.length === 0) {
      broken.push(`${dir}: отсутствует description`);
    }
    if (front.name && front.name !== dir) {
      broken.push(`${dir}: name="${front.name}" не совпадает с именем каталога`);
    }
  }

  assert.deepEqual(broken, [], `невалидные скиллы:\n  ${broken.join("\n  ")}`);
});
