import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const poseRoot = join(repositoryRoot, "games/make-a-mess/docs/creature-blockouts/poses/m1");
const reviewRoot = join(repositoryRoot, "games/make-a-mess/docs/creature-blockouts/review");

await mkdir(reviewRoot, { recursive: true });

async function tile(relativePath, width = 640, height = 400) {
  return sharp(join(poseRoot, relativePath))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

async function sheet(name, paths, columns, width = 640, height = 400) {
  const rows = Math.ceil(paths.length / columns);
  const images = await Promise.all(paths.map((path) => tile(path, width, height)));
  await sharp({
    create: { width: columns * width, height: rows * height, channels: 3, background: "#d9dde0" },
  })
    .composite(images.map((input, index) => ({
      input,
      left: (index % columns) * width,
      top: Math.floor(index / columns) * height,
    })))
    .png()
    .toFile(join(reviewRoot, name));
}

await sheet("panther-rig-m1-actions.png", [
  "panther/panther-stand-observe.png",
  "panther/panther-walk-support.png",
  "panther/panther-stalk.png",
  "panther/panther-gallop-gather.png",
  "panther/panther-gallop-extend.png",
  "panther/panther-jump-preload.png",
  "panther/panther-jump-flight.png",
  "panther/panther-landing-absorb.png",
  "panther/panther-lie-observe.png",
], 3);

await sheet("dragon-rig-m1-actions.png", [
  "dragon/dragon-ground-observe.png",
  "dragon/dragon-walk-support.png",
  "dragon/dragon-takeoff-preload.png",
  "dragon/dragon-takeoff-release.png",
  "dragon/dragon-flight-downstroke.png",
  "dragon/dragon-flight-upstroke.png",
  "dragon/dragon-glide.png",
  "dragon/dragon-bank-turn.png",
  "dragon/dragon-hover-brake.png",
  "dragon/dragon-dive.png",
  "dragon/dragon-landing-flare.png",
  "dragon/dragon-touchdown.png",
], 3);

await sheet("creature-rig-m1-skeletons.png", [
  "panther/panther-skeleton-profile.png",
  "panther/panther-skeleton-three-quarter.png",
  "dragon/dragon-skeleton-ground-profile.png",
  "dragon/dragon-skeleton-flight-front.png",
], 2, 800, 500);
