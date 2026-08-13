import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { virginLandsPalaceBlockoutObject } from "../games/make-a-mess/src/content/objects/astana/virginLandsPalaceBlockoutObject.ts";
import { virginLandsPalaceObject } from "../games/make-a-mess/src/content/objects/astana/virginLandsPalaceObject.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");

async function exportModel(model, relativeDirectory) {
  const directory = resolve(repositoryRoot, relativeDirectory);
  await mkdir(directory, { recursive: true });
  const payload = `${JSON.stringify(model, null, 2)}\n`;
  const file = resolve(directory, "model-artifact.json");
  await writeFile(file, payload);
  const sha256 = createHash("sha256").update(payload).digest("hex");
  process.stdout.write(`${model.revision} ${sha256} ${file}\n`);
}

await exportModel(
  virginLandsPalaceBlockoutObject,
  "games/make-a-mess/docs/virgin-lands-palace/blockout-b01",
);
await exportModel(
  virginLandsPalaceObject,
  "games/make-a-mess/docs/virgin-lands-palace/d02",
);
