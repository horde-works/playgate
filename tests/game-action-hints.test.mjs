import assert from "node:assert/strict";
import test from "node:test";
import { ui } from "../app/i18n/dictionary.ts";
import {
  gameActionHints,
  hintsForGameAction,
} from "../games/make-a-mess/src/game/gameActionHints.ts";

test("the first-spawn guidance is a reusable game action cue", () => {
  const [hint] = hintsForGameAction("player.spawned");
  // General movement plus two distinct calls for each scheduled carrier:
  // an uncrewed service flight ashore and a passenger flight aboard.
  assert.equal(gameActionHints.length, 12);
  assert.equal(hint.id, "first-look");
  assert.equal(hint.once, true);
  assert.equal(hint.delayMs >= 2_000, true);
  assert.equal(hint.durationMs >= 6_000, true);
});

test("each map names its uncrewed flight in its own language", () => {
  const [terminal] = hintsForGameAction("terminal-departure.approaching");
  const [viking] = hintsForGameAction("viking-departure.approaching");
  const [town] = hintsForGameAction("town-departure.approaching");

  assert.equal(terminal.id, "approaching-terminal-dispatch");
  assert.equal(viking.id, "approaching-viking-watch");
  assert.equal(town.id, "approaching-town-airship-dispatch");
  assert.equal(terminal.detailKey, "hint.departure.action");
  assert.equal(viking.detailKey, "hint.vikingDeparture.action");
  assert.notEqual(ui.ru[terminal.detailKey], ui.ru[viking.detailKey]);
  assert.notEqual(ui.ru[town.detailKey], ui.ru[viking.detailKey]);
  assert.match(ui.ru[terminal.titleKey], /Пустой состав/);
  assert.match(ui.ru[viking.titleKey], /Пустой драккар/);
  assert.match(ui.ru[town.titleKey], /Пустой дирижабль/);
});

test("passenger flights are advertised separately from empty service flights", () => {
  const [terminal] = hintsForGameAction("terminal-ride.approaching");
  const [viking] = hintsForGameAction("viking-ride.approaching");
  const [town] = hintsForGameAction("town-ride.approaching");

  assert.equal(terminal.detailKey, "hint.ride.action");
  assert.equal(viking.detailKey, "hint.vikingRide.action");
  assert.equal(town.detailKey, "hint.townRide.action");
  assert.match(ui.ru[terminal.eyebrowKey], /Пассажирский/);
  assert.match(ui.ru[viking.eyebrowKey], /На борту/);
  assert.match(ui.ru[town.eyebrowKey], /На борту/);
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
