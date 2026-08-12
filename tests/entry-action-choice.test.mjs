import assert from "node:assert/strict";
import test from "node:test";
import {
  entryInteractionActions,
  entryInteractionMatches,
  keyboardDigit,
  numberedEntryInteractionAction,
} from "../games/make-a-mess/src/game/entryInteraction.ts";
import { directWeaponShortcut } from "../games/make-a-mess/src/game/weaponShortcuts.ts";

test("weapon digits work on the number row, NumPad, and code-poor keyboards", () => {
  assert.equal(keyboardDigit("Digit6", "6"), 6);
  assert.equal(keyboardDigit("Numpad6", "6"), 6);
  assert.equal(keyboardDigit("Unidentified", "6"), 6);
  assert.equal(keyboardDigit("Digit6", "^"), 6);
  assert.equal(keyboardDigit("KeyG", "g"), null);
  assert.equal(directWeaponShortcut(keyboardDigit("Digit6", "6")), "construction");
  assert.equal(directWeaponShortcut(keyboardDigit("Numpad6", "6")), "construction");
});

const ride = {
  id: "town:airship:ride",
  kind: "ride",
  actions: [
    { id: "tour", labelKey: "hint.townRide.action" },
    {
      id: "transfer:viking-village",
      labelKey: "destination.vikingVillage",
    },
  ],
};

test("ordinary interactions remain one primary Space action", () => {
  assert.deepEqual(entryInteractionActions({ id: "door", kind: "door" }), [
    { id: "primary", labelKey: "" },
  ]);
  assert.equal(numberedEntryInteractionAction({ id: "door", kind: "door" }, 1), null);
});

test("numbered actions are one-based and bounded", () => {
  assert.equal(numberedEntryInteractionAction(ride, 1)?.id, "tour");
  assert.equal(
    numberedEntryInteractionAction(ride, 2)?.id,
    "transfer:viking-village",
  );
  assert.equal(numberedEntryInteractionAction(ride, 0), null);
  assert.equal(numberedEntryInteractionAction(ride, 3), null);
});

test("a selected action still belongs to the exact advertised target", () => {
  assert.equal(
    entryInteractionMatches(
      { ...ride, selectedActionId: "transfer:viking-village" },
      ride,
    ),
    true,
  );
});
