import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const poseRoot = join(repositoryRoot, "games/make-a-mess/docs/creature-blockouts/poses/m2");
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

await sheet("panther-rig-m2-walk.png", [
  "panther/panther-walk-01-left-hind-lift.png",
  "panther/panther-walk-02-left-hind-place.png",
  "panther/panther-walk-03-left-fore-lift.png",
  "panther/panther-walk-04-left-fore-place.png",
  "panther/panther-walk-05-right-hind-lift.png",
  "panther/panther-walk-06-right-hind-place.png",
  "panther/panther-walk-07-right-fore-lift.png",
  "panther/panther-walk-08-right-fore-place.png",
], 4);

await sheet("panther-rig-m2-trot.png", [
  "panther/panther-trot-01-left-diagonal.png",
  "panther/panther-trot-02-flight.png",
  "panther/panther-trot-03-right-diagonal.png",
  "panther/panther-trot-04-flight.png",
], 4);

await sheet("panther-rig-m2-rotary-gallop.png", [
  "panther/panther-gallop-01-extended-flight.png",
  "panther/panther-gallop-02-right-fore-contact.png",
  "panther/panther-gallop-03-left-fore-contact.png",
  "panther/panther-gallop-04-gathered-flight.png",
  "panther/panther-gallop-05-left-hind-contact.png",
  "panther/panther-gallop-06-right-hind-push.png",
  "panther/panther-gallop-07-spine-opening.png",
  "panther/panther-gallop-08-extended-flight.png",
], 4);

await sheet("panther-rig-m2-actions.png", [
  "panther/panther-stand-observe.png",
  "panther/panther-stalk.png",
  "panther/panther-jump-preload.png",
  "panther/panther-jump-flight.png",
  "panther/panther-landing-absorb.png",
  "panther/panther-lie-observe.png",
  "panther/panther-accelerate-hind-drive.png",
  "panther/panther-brake-fore-absorb.png",
], 4);

await sheet("dragon-rig-m2-takeoff.png", [
  "dragon/dragon-takeoff-preload.png",
  "dragon/dragon-takeoff-hind-drive.png",
  "dragon/dragon-takeoff-manus-vault.png",
  "dragon/dragon-takeoff-clearance.png",
  "dragon/dragon-takeoff-unfold.png",
  "dragon/dragon-takeoff-first-downstroke.png",
], 3);

await sheet("dragon-rig-m2-wing-control.png", [
  "dragon/dragon-flight-downstroke.png",
  "dragon/dragon-flight-upstroke.png",
  "dragon/dragon-glide.png",
  "dragon/dragon-bank-turn.png",
  "dragon/dragon-hover-brake.png",
  "dragon/dragon-dive.png",
], 3);

await sheet("dragon-rig-m2-landing.png", [
  "dragon/dragon-landing-flare.png",
  "dragon/dragon-landing-touchdown.png",
  "dragon/dragon-landing-wing-unload.png",
  "dragon/dragon-ground-recovery.png",
], 4);

await sheet("creature-rig-m2-skeletons.png", [
  "panther/panther-skeleton-profile.png",
  "panther/panther-skeleton-three-quarter.png",
  "dragon/dragon-skeleton-ground-profile.png",
  "dragon/dragon-skeleton-flight-front.png",
], 2, 800, 500);
