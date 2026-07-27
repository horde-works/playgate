import assert from "node:assert/strict";
import test from "node:test";
import { entryInteractionMatches } from "../games/make-a-mess/src/game/entryInteraction.ts";

const DOOR = { id: "terminal:sky-train:head:door", kind: "town-door" };
const RIDE = { id: "terminal:sky-train:ride", kind: "ride" };

test("one Space command belongs to one advertised entry", () => {
  assert.equal(entryInteractionMatches(DOOR, DOOR), true);
  assert.equal(entryInteractionMatches(DOOR, RIDE), false);
  assert.equal(entryInteractionMatches(RIDE, DOOR), false);
  assert.equal(entryInteractionMatches(null, DOOR), false);
});

test("matching requires both identity and interaction kind", () => {
  assert.equal(
    entryInteractionMatches(DOOR, { ...DOOR, kind: "ride" }),
    false,
  );
  assert.equal(
    entryInteractionMatches(DOOR, { ...DOOR, id: "another-door" }),
    false,
  );
});
