import assert from "node:assert/strict";
import test from "node:test";

import { ui } from "../app/i18n/dictionary.ts";
import {
  ISLAND_CHART,
  interIslandJourneyCopyKey,
} from "../games/make-a-mess/src/game/islandTopology.ts";

const JOURNEY_MESSAGES = [
  "departingFor",
  "enteringAirspace",
  "welcome",
  "approach",
];

test("every charted island has all four crossing messages in every UI language", () => {
  for (const island of Object.keys(ISLAND_CHART)) {
    for (const message of JOURNEY_MESSAGES) {
      const key = interIslandJourneyCopyKey(island, message);
      for (const language of Object.keys(ui)) {
        assert.ok(ui[language][key], `${language} is missing ${key}`);
      }
    }
  }
});

test("the shared transit copy exists in every UI language", () => {
  for (const key of [
    "interIsland.transitEyebrow",
    "interIsland.aboard",
    "hud.takeControl",
    "hud.takeControlTouch",
  ]) {
    for (const language of Object.keys(ui)) {
      assert.ok(ui[language][key], `${language} is missing ${key}`);
    }
  }
});

test("the first route uses the requested English arrival copy", () => {
  assert.equal(
    ui.en[interIslandJourneyCopyKey("viking-village", "enteringAirspace")],
    "Entering the village airspace…",
  );
  assert.equal(
    ui.en[interIslandJourneyCopyKey("viking-village", "welcome")],
    "Welcome to Viking Village",
  );
  assert.equal(
    ui.en[interIslandJourneyCopyKey("town", "enteringAirspace")],
    "Entering the town airspace…",
  );
  assert.equal(
    ui.en[interIslandJourneyCopyKey("town", "welcome")],
    "Welcome to the Town",
  );
});

test("leaving and arriving read as the two halves of one crossing", () => {
  // The shutter closes on a named destination and opens on the same name:
  // without that pairing the two halves read as unrelated events.
  for (const island of Object.keys(ISLAND_CHART)) {
    for (const language of Object.keys(ui)) {
      const leaving = ui[language][interIslandJourneyCopyKey(island, "departingFor")];
      const welcome = ui[language][interIslandJourneyCopyKey(island, "welcome")];
      const approach = ui[language][interIslandJourneyCopyKey(island, "approach")];
      assert.notEqual(leaving, welcome);
      assert.notEqual(approach, welcome);
    }
  }
});
