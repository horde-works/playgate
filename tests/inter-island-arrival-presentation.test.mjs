import assert from "node:assert/strict";
import test from "node:test";

import { ui } from "../app/i18n/dictionary.ts";
import {
  ISLAND_CHART,
  interIslandArrivalCopyKey,
} from "../games/make-a-mess/src/game/islandTopology.ts";

test("every charted island has both arrival messages in every UI language", () => {
  for (const destination of Object.keys(ISLAND_CHART)) {
    for (const message of ["enteringAirspace", "welcome"]) {
      const key = interIslandArrivalCopyKey(destination, message);
      for (const language of Object.keys(ui)) {
        assert.ok(ui[language][key], `${language} is missing ${key}`);
      }
    }
  }
});

test("the first route uses the requested English arrival copy", () => {
  assert.equal(
    ui.en[interIslandArrivalCopyKey("viking-village", "enteringAirspace")],
    "Entering the village airspace…",
  );
  assert.equal(
    ui.en[interIslandArrivalCopyKey("viking-village", "welcome")],
    "Welcome to Viking Village",
  );
  assert.equal(
    ui.en[interIslandArrivalCopyKey("town", "enteringAirspace")],
    "Entering the town airspace…",
  );
  assert.equal(
    ui.en[interIslandArrivalCopyKey("town", "welcome")],
    "Welcome to the Town",
  );
});
