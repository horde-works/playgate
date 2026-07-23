import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  flyoverChapterAt,
  flyoverSegmentAt,
  flyoverTimeOfDayAt,
} from "../games/make-a-mess/src/game/cinematicFlyoverPlan.ts";
import { vikingVillageFlyover } from "../games/make-a-mess/src/game/vikingVillageFlyover.ts";

test("the Viking flyover is a complete authored camera story", () => {
  const { chapters, keyframes } = vikingVillageFlyover;
  assert.equal(vikingVillageFlyover.durationSeconds, 92);
  assert.equal(keyframes[0].at, 0);
  assert.equal(keyframes.at(-1).at, 1);
  assert.equal(keyframes.length >= 12, true);
  assert.equal(chapters.length, 7);

  for (let index = 1; index < keyframes.length; index += 1) {
    assert.equal(keyframes[index].at > keyframes[index - 1].at, true);
  }
  for (const chapter of chapters) {
    assert.equal(chapter.from < chapter.to, true);
    assert.equal(chapter.captureAt >= chapter.from, true);
    assert.equal(chapter.captureAt <= chapter.to, true);
    assert.match(chapter.stillImage, /^\/games\/make-a-mess\/flyovers\/viking-village\/\d{2}-[a-z-]+\.png$/);
    const png = readFileSync(new URL(`../public${chapter.stillImage}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), 1920);
    assert.equal(png.readUInt32BE(20), 1080);
    assert.equal(/[А-Яа-яЁё]/.test(`${chapter.kicker ?? ""}${chapter.title}${chapter.body ?? ""}`), false);
  }
});

test("camera, story and time-of-day plans resolve deterministically", () => {
  const { chapters, keyframes } = vikingVillageFlyover;
  assert.deepEqual(flyoverSegmentAt(keyframes, 0), { index: 0, localProgress: 0 });
  assert.equal(flyoverSegmentAt(keyframes, 1).localProgress, 1);
  assert.equal(flyoverChapterAt(chapters, 0.515)?.id, "future-house");
  assert.equal(flyoverChapterAt(chapters, 0.69), null);
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.05), "sunset");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.3), "day");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.7), "sunset");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.9), "night");
});

test("the captions tell one settlement story instead of naming props", () => {
  const copy = vikingVillageFlyover.chapters
    .flatMap((chapter) => [chapter.kicker, chapter.title, chapter.body])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  assert.equal(copy.includes("they chose to stay"), true);
  assert.equal(copy.includes("another winter"), true);
  assert.equal(copy.includes("another family"), true);
  assert.equal(copy.includes("this is a"), false);
  assert.equal(copy.includes("look at the"), false);
});
