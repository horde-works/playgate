import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const audioRoot = new URL(
  "../public/games/make-a-mess/audio/",
  import.meta.url,
);

test("the physical audio bank contains compact licensed recordings", async () => {
  const [kenneyFiles, explosionFiles, license] = await Promise.all([
    readdir(new URL("kenney/", audioRoot)),
    readdir(new URL("explosions/", audioRoot)),
    readFile(new URL("LICENSES.md", audioRoot), "utf8"),
  ]);

  assert.equal(kenneyFiles.length, 36);
  assert.deepEqual(explosionFiles.sort(), [
    "big-explosion.ogg",
    "explosion-heavy.ogg",
  ]);
  assert.match(license, /Creative\s+Commons Zero \(CC0 1\.0\)/);
  assert.match(license, /kenney\.nl\/assets\/impact-sounds/);

  const recordings = [
    ...kenneyFiles.map((name) => new URL(`kenney/${name}`, audioRoot)),
    ...explosionFiles.map(
      (name) => new URL(`explosions/${name}`, audioRoot),
    ),
  ];
  const sizes = await Promise.all(
    recordings.map(async (recording) => (await stat(recording)).size),
  );
  assert.equal(sizes.every((size) => size > 5_000), true);
  assert.equal(sizes.reduce((sum, size) => sum + size, 0) < 600_000, true);
});
