import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const captureRoot = join(repositoryRoot, "games/make-a-mess/docs/creature-blockouts/captures/p6");
const reviewRoot = join(repositoryRoot, "games/make-a-mess/docs/creature-blockouts/review");

await mkdir(reviewRoot, { recursive: true });

async function tile(relativePath) {
  return sharp(join(captureRoot, relativePath))
    .resize(800, 500, { fit: "fill" })
    .png()
    .toBuffer();
}

async function sheet(name, paths) {
  const images = await Promise.all(paths.map(tile));
  await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#d9dde0" },
  })
    .composite(images.map((input, index) => ({
      input,
      left: (index % 2) * 800,
      top: Math.floor(index / 2) * 500,
    })))
    .png()
    .toFile(join(reviewRoot, name));
}

await sheet("panther-p4-review.png", [
  "panther/panther-three-quarter.png",
  "panther/panther-profile.png",
  "panther/panther-front.png",
  "panther/panther-top.png",
]);

await sheet("dragon-p4-review.png", [
  "dragon-ground/dragon-ground-three-quarter.png",
  "dragon-ground/dragon-ground-profile.png",
  "dragon-flight/dragon-flight-top.png",
  "dragon-flight/dragon-flight-three-quarter.png",
]);
