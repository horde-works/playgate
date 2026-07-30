import assert from "node:assert/strict";
import test from "node:test";
import {
  carrierVector,
  interIslandPassengerAccess,
  interIslandWeaponSelectionBlocked,
  parseInterIslandPassengerTransit,
  vectorFromCarrier,
} from "../games/make-a-mess/src/game/interIslandPassenger.ts";

test("an active transfer keeps the ship as the inertial frame", () => {
  assert.deepEqual(interIslandPassengerAccess(true, true), {
    inertialFrame: "carrier",
    ignoreWorldBoundary: true,
    weaponEnabled: false,
  });
  assert.deepEqual(interIslandPassengerAccess(true, false), {
    inertialFrame: "carrier",
    ignoreWorldBoundary: false,
    weaponEnabled: false,
  });
  assert.deepEqual(interIslandPassengerAccess(false, true), {
    inertialFrame: "world",
    ignoreWorldBoundary: false,
    weaponEnabled: true,
  });
});

test("weapon selection is rejected only for armed choices during a transfer", () => {
  assert.equal(interIslandWeaponSelectionBlocked(true, "hammer"), true);
  assert.equal(interIslandWeaponSelectionBlocked(true, "rocket"), true);
  assert.equal(interIslandWeaponSelectionBlocked(true, "none"), false);
  assert.equal(interIslandWeaponSelectionBlocked(false, "hammer"), false);
});

test("carrier coordinates survive a hull with a different authored nose", () => {
  const worldVector = [3, 2, -4];
  const coordinates = carrierVector(worldVector, [0, 0, 1]);
  assert.deepEqual(coordinates, { forward: -4, right: 3, up: 2 });
  assert.deepEqual(vectorFromCarrier(coordinates, [1, 0, 0]), [-4, 2, -3]);
  assert.deepEqual(
    carrierVector(vectorFromCarrier(coordinates, [1, 0, 0]), [1, 0, 0]),
    coordinates,
  );
});

test("only finite, known-island transit snapshots are restored", () => {
  const snapshot = {
    version: 1,
    origin: "town",
    destination: "viking-village",
    eyeOffset: { forward: 0.5, right: -0.25, up: 0 },
    relativeVelocity: { forward: 1, right: 0, up: 0 },
    lookDirection: { forward: 1, right: 0, up: 0.1 },
  };
  assert.deepEqual(
    parseInterIslandPassengerTransit(JSON.stringify(snapshot)),
    snapshot,
  );
  assert.equal(parseInterIslandPassengerTransit("not-json"), null);
  assert.equal(
    parseInterIslandPassengerTransit(
      JSON.stringify({ ...snapshot, destination: "unknown" }),
    ),
    null,
  );
  assert.equal(
    parseInterIslandPassengerTransit(
      JSON.stringify({
        ...snapshot,
        relativeVelocity: { forward: Infinity, right: 0, up: 0 },
      }),
    ),
    null,
  );
});
