import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Штатный офлайн-рендер объекта: PNG без браузера и без сборки мира. Он же —
// единственный способ снять одинаковые ракурсы, когда соседний мир не
// компилируется. Смоук-тест держит его рабочим: инструмент приёмки, который
// сам сломался, хуже отсутствующего.
const OUT = mkdtempSync(join(tmpdir(), "render-object-"));

function render(args) {
  const target = join(OUT, `${args.join("-").replace(/[^\w-]/g, "")}.png`);
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/render-object.mjs", ...args, "--out", target],
    { encoding: "utf8" },
  );
  return readFileSync(target);
}

function isPng(buffer) {
  return (
    buffer.length > 1000 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  );
}

test("the offline renderer draws a tree without a browser", () => {
  for (const kind of ["oak", "birch", "pine", "willow"]) {
    const png = render(["--tree", kind, "--seed", "71", "--view", "side", "--width", "180", "--height", "180"]);
    assert.ok(isPng(png), `${kind}: не PNG`);
  }
});

test("every shrub species renders and reads differently", () => {
  const sizes = new Map();
  for (const kind of ["shrub", "hedge", "thicket", "needle", "heath", "cane", "steppe", "sedge"]) {
    const png = render(["--shrub", kind, "--seed", "17", "--view", "side", "--width", "180", "--height", "180"]);
    assert.ok(isPng(png), `${kind}: не PNG`);
    sizes.set(kind, png.length);
  }
  // Сжатый размер — грубая, но независимая подпись силуэта: если бы все виды
  // рисовались одним комом, картинки совпали бы байт в байт.
  assert.equal(new Set(sizes.values()).size, sizes.size, "виды рисуются одинаково");
});

test("views differ: a silhouette is not the shaded side view", () => {
  const side = render(["--tree", "pine", "--seed", "71", "--view", "side", "--width", "180", "--height", "180"]);
  const silhouette = render(["--tree", "pine", "--seed", "71", "--view", "silhouette", "--width", "180", "--height", "180"]);
  const top = render(["--tree", "pine", "--seed", "71", "--view", "top", "--width", "180", "--height", "180"]);
  assert.ok(!side.equals(silhouette));
  assert.ok(!side.equals(top));
});
