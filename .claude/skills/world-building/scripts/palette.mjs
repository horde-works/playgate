// Сетка средних цветов картинки: ужимаем до N×N и печатаем hex построчно.
//
// Раньше это делал sips, то есть инструмент работал только на macOS. Теперь
// используется sharp — он уже есть в node_modules (приходит с next), новых
// зависимостей не добавляет и одинаково работает на обеих машинах проекта.
//
//   node .claude/skills/world-building/scripts/palette.mjs photo.jpg [...]
//   node .claude/skills/world-building/scripts/palette.mjs --grid 12 photo.png

import { basename } from "node:path";
import sharp from "sharp";

async function grid(path, n) {
  // fit: "fill" — намеренно, нам нужна ровная сетка n×n, а не сохранение
  // пропорций: каждая клетка должна усреднять свой участок кадра.
  const { data, info } = await sharp(path)
    .resize(n, n, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rows = [];
  for (let y = 0; y < info.height; y += 1) {
    const line = [];
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const hex = [data[i], data[i + 1], data[i + 2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      line.push(`#${hex}`);
    }
    rows.push(line);
  }
  return rows;
}

const args = process.argv.slice(2);
let size = 8;
const paths = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--grid") {
    size = Number(args[i + 1]);
    i += 1;
  } else {
    paths.push(args[i]);
  }
}

if (paths.length === 0) {
  console.error("usage: palette.mjs [--grid N] <image> [image...]");
  process.exit(2);
}

for (const path of paths) {
  console.log(`--- ${basename(path)}`);
  try {
    for (const line of await grid(path, size)) {
      console.log(`  ${line.join(" ")}`);
    }
  } catch (err) {
    console.error(`  ОШИБКА: ${err.message}`);
    process.exitCode = 1;
  }
}
