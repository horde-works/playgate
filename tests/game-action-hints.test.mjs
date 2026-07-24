import assert from "node:assert/strict";
import test from "node:test";
import { ui } from "../app/i18n/dictionary.ts";
import {
  gameActionHints,
  hintsForGameAction,
} from "../games/make-a-mess/src/game/gameActionHints.ts";

test("the first-spawn guidance is a reusable game action cue", () => {
  const [hint] = hintsForGameAction("player.spawned");
  assert.equal(gameActionHints.length, 4);
  assert.equal(hint.id, "first-look");
  assert.equal(hint.once, true);
  assert.equal(hint.delayMs >= 2_000, true);
  assert.equal(hint.durationMs >= 6_000, true);
});

test("the Viking gate requirement is persistent and repeatable", () => {
  const [hint] = hintsForGameAction("gate.approaching");

  assert.equal(hint.id, "approaching-the-gate");
  assert.equal(hint.once, false);
  assert.equal(hint.delayMs < 500, true);
  assert.equal(hint.durationMs, undefined);
  assert.equal(hint.keyLabelKey, "hint.gate.key");
});

test("the Viking house threshold has its own entry request", () => {
  const [hint] = hintsForGameAction("door.approaching");

  assert.equal(hint.id, "approaching-a-door");
  assert.equal(hint.once, false);
  assert.equal(hint.durationMs, undefined);
  assert.equal(hint.detailKey, "hint.door.action");
});

test("the town house threshold has its own entry request", () => {
  const [hint] = hintsForGameAction("town-door.approaching");

  assert.equal(hint.id, "approaching-a-town-door");
  assert.equal(hint.once, false);
  assert.equal(hint.durationMs, undefined);
  assert.equal(hint.detailKey, "hint.townDoor.action");
});

test("game action guidance is complete in every interface language", () => {
  for (const language of ["en", "es", "ru"]) {
    for (const hint of gameActionHints) {
      assert.equal(ui[language][hint.eyebrowKey].length > 0, true);
      assert.equal(ui[language][hint.titleKey].length > 0, true);
      assert.equal(ui[language][hint.detailKey].length > 0, true);
      if (hint.touchDetailKey) {
        assert.equal(ui[language][hint.touchDetailKey].length > 0, true);
      }
      if (hint.keyLabelKey) {
        assert.equal(ui[language][hint.keyLabelKey].length > 0, true);
      }
    }
  }
});
