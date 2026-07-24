import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MathUtils, Vector3 } from "three";
import {
  flyoverChapterAt,
  flyoverSegmentAt,
  flyoverTimeOfDayAt,
} from "../games/make-a-mess/src/game/cinematicFlyoverPlan.ts";
import { townFlyover } from "../games/make-a-mess/src/game/townFlyover.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

function assertFullHdPng(publicPath) {
  const png = readFileSync(new URL(`../public${publicPath}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 1080);
}

function catmullRom(previous, start, end, next, amount) {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  const startTangent = end.clone().sub(previous).multiplyScalar(0.5);
  const endTangent = next.clone().sub(start).multiplyScalar(0.5);
  return start
    .clone()
    .multiplyScalar(2 * amount3 - 3 * amount2 + 1)
    .addScaledVector(startTangent, amount3 - 2 * amount2 + amount)
    .addScaledVector(end, -2 * amount3 + 3 * amount2)
    .addScaledVector(endTangent, amount3 - amount2);
}

test("the town flyover is a complete authored city story", () => {
  const { chapters, keyframes } = townFlyover;
  assert.equal(townFlyover.durationSeconds, 112);
  assert.equal(townFlyover.locationLabel, "THE OLD QUARTER");
  assert.equal(townFlyover.backLabel, "BACK TO THE CITY");
  assert.equal(keyframes[0].at, 0);
  assert.equal(keyframes.at(-1).at, 1);
  assert.equal(keyframes.length, 26);
  assert.equal(chapters.length, 9);

  for (let index = 1; index < keyframes.length; index += 1) {
    assert.equal(keyframes[index].at > keyframes[index - 1].at, true);
  }
  for (const chapter of chapters) {
    assert.equal(chapter.from < chapter.to, true);
    assert.equal(chapter.captureAt >= chapter.from, true);
    assert.equal(chapter.captureAt <= chapter.to, true);
    assert.match(
      chapter.stillImage,
      /^\/games\/make-a-mess\/flyovers\/town\/text\/\d{2}-[a-z-]+\.png$/,
    );
    assert.match(
      chapter.cleanStillImage,
      /^\/games\/make-a-mess\/flyovers\/town\/clean\/\d{2}-[a-z-]+\.png$/,
    );
    assertFullHdPng(chapter.stillImage);
    assertFullHdPng(chapter.cleanStillImage);
    assert.equal(
      /[А-Яа-яЁё]/.test(`${chapter.kicker ?? ""}${chapter.title}${chapter.body ?? ""}`),
      false,
    );
  }
});

test("the town story moves from wet day through sunset into a high night orbit", () => {
  const { chapters, keyframes } = townFlyover;
  assert.deepEqual(flyoverSegmentAt(keyframes, 0), { index: 0, localProgress: 0 });
  assert.equal(flyoverSegmentAt(keyframes, 1).localProgress, 1);
  assert.equal(flyoverChapterAt(chapters, 0.405)?.id, "one-winter-at-a-time");
  assert.equal(flyoverChapterAt(chapters, 0.65)?.id, "ordinary-failure");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.6), "day");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.76), "sunset");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.88), "night");

  for (const keyframe of keyframes.slice(-4)) {
    assert.equal(keyframe.timeOfDay, "night");
    assert.equal(keyframe.position[1] >= 26, true);
  }
  const finale = chapters.at(-1);
  assert.equal(finale.title, "NEVER ALL AT ONCE");
  assert.equal(finale.textScale, "hero");
  assert.equal(finale.align, "center");
});

test("the smoothed town camera route clears authored structures", () => {
  const positions = townFlyover.keyframes.map(
    (keyframe) => new Vector3(...keyframe.position),
  );
  const solidPieces = townScene.breakablePieces.filter(
    (piece) =>
      piece.shape !== "groundTile" &&
      piece.shape !== "glassPane" &&
      piece.material !== "foliage" &&
      piece.position[1] + piece.size[1] / 2 > 0.4,
  );
  const cameraClearance = 0.18;

  for (let segment = 0; segment < positions.length - 1; segment += 1) {
    for (let sample = 0; sample <= 30; sample += 1) {
      const amount = MathUtils.smootherstep(sample / 30, 0, 1);
      const camera = catmullRom(
        positions[Math.max(0, segment - 1)],
        positions[segment],
        positions[segment + 1],
        positions[Math.min(positions.length - 1, segment + 2)],
        amount,
      );
      const collision = solidPieces.find(
        (piece) =>
          Math.abs(camera.x - piece.position[0]) <= piece.size[0] / 2 + cameraClearance &&
          Math.abs(camera.y - piece.position[1]) <= piece.size[1] / 2 + cameraClearance &&
          Math.abs(camera.z - piece.position[2]) <= piece.size[2] / 2 + cameraClearance,
      );
      assert.equal(
        collision,
        undefined,
        `camera segment ${segment} intersects ${collision?.id ?? "a structure"}`,
      );
    }
  }
});

test("the captions tell how the neighbourhood accumulated instead of labeling props", () => {
  const copy = townFlyover.chapters
    .flatMap((chapter) => [chapter.kicker, chapter.title, chapter.body])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  assert.equal(copy.includes("never all at once"), true);
  assert.equal(copy.includes("another path"), true);
  assert.equal(copy.includes("kept becoming"), true);
  assert.equal(copy.includes("this is a"), false);
  assert.equal(copy.includes("look at the"), false);
});
