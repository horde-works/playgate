/**
 * Лицензионный контур миров. Печатает лицензию контента каждого мира и
 * проверяет два инварианта из LICENSING.md:
 *
 *   1. запрет производных (SPDX …-ND-…) → мир обязан быть неразрушимым;
 *   2. запрет коммерции (SPDX …-NC-…) → мир не попадает в коммерческую сборку.
 *
 *   node scripts/check-licensing.mjs                    — обычная проверка
 *   COMMERCIAL_BUILD=1 node scripts/check-licensing.mjs — проверка перед
 *                                                          коммерческим релизом
 *
 * Первый инвариант держит и сама сборка сцены (createDestructionScene бросает
 * ошибку), здесь он продублирован ради читаемого отчёта.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  describeContentLicence,
  forbidsCommercialUse,
  forbidsDerivatives,
} from "../games/make-a-mess/src/game/contentLicensing.ts";

const WORLDS = [
  ["Open House", "games/make-a-mess/src/game/townScene.ts"],
  ["Grand Terminal", "games/make-a-mess/src/game/grandTerminalScene.ts"],
  ["Basalt Stronghold", "games/make-a-mess/src/game/basaltStrongholdScene.ts"],
  ["Viking Village", "games/make-a-mess/src/game/vikingVillageScene.ts"],
  ["Astana", "games/make-a-mess/src/game/astanaScene.ts"],
];

const commercial = process.env.COMMERCIAL_BUILD === "1";
const problems = [];
const rows = [];

for (const [name, modulePath] of WORLDS) {
  const worldModule = await import(pathToFileURL(resolve(modulePath)).href);
  const scene = Object.values(worldModule).find(
    (value) =>
      value &&
      typeof value === "object" &&
      "breakablePieces" in value &&
      "resolveStructuralCollapse" in value,
  );
  if (!scene) {
    problems.push(`${name}: в ${modulePath} не нашёл сцену`);
    continue;
  }

  const licence = describeContentLicence(scene.contentLicense);
  const noDerivatives = forbidsDerivatives(scene.contentLicense);
  const nonCommercial = forbidsCommercialUse(scene.contentLicense);

  rows.push({
    name,
    licence,
    preserved: scene.indestructible ? "да" : "нет",
    pack: nonCommercial ? "бесплатный" : "любой",
  });

  if (noDerivatives && !scene.indestructible) {
    problems.push(
      `${name}: лицензия ${licence} запрещает производные, но мир собран разрушимым`,
    );
  }
  if (commercial && nonCommercial) {
    problems.push(
      `${name}: лицензия ${licence} запрещает коммерческое использование — ` +
        "мир не может попасть в коммерческую сборку (замените хаб выдуманным островом)",
    );
  }
}

const width = (key) =>
  Math.max(key.length, ...rows.map((row) => String(row[key]).length));
const widths = {
  name: width("name"),
  licence: width("licence"),
  preserved: Math.max(11, width("preserved")),
  pack: Math.max(4, width("pack")),
};
console.log(
  `${"мир".padEnd(widths.name)}  ${"лицензия контента".padEnd(widths.licence)}  заповедник  пак`,
);
for (const row of rows) {
  console.log(
    `${row.name.padEnd(widths.name)}  ${row.licence.padEnd(widths.licence)}  ` +
      `${row.preserved.padEnd(10)}  ${row.pack}`,
  );
}
console.log(
  commercial
    ? "\nрежим: коммерческая сборка (NC-контент запрещён)"
    : "\nрежим: обычная сборка",
);

if (problems.length > 0) {
  console.error(`\nнарушений: ${problems.length}`);
  for (const problem of problems) console.error(`  — ${problem}`);
  process.exit(1);
}
console.log("нарушений нет");
