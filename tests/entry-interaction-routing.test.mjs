import assert from "node:assert/strict";
import test from "node:test";
import {
  entryInteractionMatches,
  preferredEntryInteraction,
} from "../games/make-a-mess/src/game/entryInteraction.ts";

const DOOR = { id: "terminal:sky-train:head:door", kind: "town-door" };
const RIDE = { id: "terminal:sky-train:ride", kind: "ride" };
const SEAT = { id: "terminal:sky-train:driver-seat", kind: "seat" };
const STAND = { id: "terminal:sky-train:driver-seat", kind: "stand" };

test("one Space command belongs to one advertised entry", () => {
  assert.equal(entryInteractionMatches(DOOR, DOOR), true);
  assert.equal(entryInteractionMatches(DOOR, RIDE), false);
  assert.equal(entryInteractionMatches(RIDE, DOOR), false);
  assert.equal(entryInteractionMatches(null, DOOR), false);
});

test("sitting and standing are two commands for the same authored place", () => {
  assert.equal(entryInteractionMatches(SEAT, SEAT), true);
  assert.equal(entryInteractionMatches(STAND, STAND), true);
  assert.equal(entryInteractionMatches(SEAT, STAND), false);
  assert.equal(entryInteractionMatches(STAND, SEAT), false);
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

test("a cue changes presentation without changing command ownership", () => {
  const advertised = {
    ...RIDE,
    cue: "terminal-passenger-flight",
  };
  const requested = {
    ...RIDE,
    cue: "viking-passenger-flight",
  };

  assert.equal(entryInteractionMatches(requested, advertised), true);
});

test("the town airship keeps exterior and onboard commands separate", () => {
  const dispatch = {
    id: "town:airship:departure",
    kind: "departure",
    cue: "town-uncrewed-flight",
  };
  const ride = {
    id: "town:airship:ride",
    kind: "ride",
    cue: "town-passenger-flight",
  };
  assert.equal(entryInteractionMatches(dispatch, dispatch), true);
  assert.equal(entryInteractionMatches(ride, ride), true);
  assert.equal(entryInteractionMatches(dispatch, ride), false);
});

test("an onboard ride wins over a nearby carrier door", () => {
  assert.equal(preferredEntryInteraction(DOOR, RIDE), RIDE);
  assert.equal(preferredEntryInteraction(DOOR, null), DOOR);
  assert.equal(
    preferredEntryInteraction(DOOR, {
      id: "town:airship:departure",
      kind: "departure",
    }),
    DOOR,
  );
});
