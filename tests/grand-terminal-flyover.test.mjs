import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  flyoverChapterAt,
  flyoverSegmentAt,
  flyoverTimeOfDayAt,
} from "../games/make-a-mess/src/game/cinematicFlyoverPlan.ts";
import { grandTerminalFlyover } from "../games/make-a-mess/src/game/grandTerminalFlyover.ts";

function assertFullHdPng(publicPath) {
  const png = readFileSync(new URL(`../public${publicPath}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 1080);
}

test("the Grand Terminal flyover is a complete authored camera story", () => {
  const { chapters, keyframes } = grandTerminalFlyover;
  assert.equal(grandTerminalFlyover.durationSeconds, 110);
  assert.equal(grandTerminalFlyover.locationLabel, "GRAND TERMINAL");
  assert.equal(grandTerminalFlyover.backLabel, "BACK TO TERMINAL");
  assert.equal(keyframes[0].at, 0);
  assert.equal(keyframes.at(-1).at, 1);
  assert.equal(keyframes.length, 15);
  assert.equal(chapters.length, 8);

  for (let index = 1; index < keyframes.length; index += 1) {
    assert.equal(keyframes[index].at > keyframes[index - 1].at, true);
  }

  for (const chapter of chapters) {
    assert.equal(chapter.from < chapter.to, true);
    assert.equal(chapter.captureAt >= chapter.from, true);
    assert.equal(chapter.captureAt <= chapter.to, true);
    assert.match(chapter.stillImage, /^\/games\/make-a-mess\/flyovers\/grand-terminal\/text\/\d{2}-[a-z-]+\.png$/);
    assert.match(chapter.cleanStillImage, /^\/games\/make-a-mess\/flyovers\/grand-terminal\/clean\/\d{2}-[a-z-]+\.png$/);
    assertFullHdPng(chapter.stillImage);
    assertFullHdPng(chapter.cleanStillImage);
    assert.equal(/[А-Яа-яЁё]/.test(`${chapter.kicker ?? ""}${chapter.title}${chapter.body ?? ""}`), false);
  }
});

test("the terminal story ends in a high sunset orbit and a hero title", () => {
  const { chapters, keyframes } = grandTerminalFlyover;
  assert.deepEqual(flyoverSegmentAt(keyframes, 0), { index: 0, localProgress: 0 });
  assert.equal(flyoverSegmentAt(keyframes, 1).localProgress, 1);
  assert.equal(flyoverChapterAt(chapters, 0.42)?.id, "board");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.6), "day");
  assert.equal(flyoverTimeOfDayAt(keyframes, 0.9), "sunset");

  for (const keyframe of keyframes.slice(-4)) {
    assert.equal(keyframe.timeOfDay, "sunset");
    assert.equal(keyframe.position[1] >= 28, true);
  }

  const finale = chapters.at(-1);
  assert.equal(finale.title, "GRAND TERMINAL");
  assert.equal(finale.textScale, "hero");
  assert.equal(finale.align, "center");
});

test("the captions tell one journey story instead of labeling terminal props", () => {
  const copy = grandTerminalFlyover.chapters
    .flatMap((chapter) => [chapter.kicker, chapter.title, chapter.body])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  assert.equal(copy.includes("promise"), true);
  assert.equal(copy.includes("journey"), true);
  assert.equal(copy.includes("grand terminal"), true);
  assert.equal(copy.includes("this is a"), false);
  assert.equal(copy.includes("look at the"), false);
});
