import assert from "node:assert/strict";
import test from "node:test";
import {
  lampBeaconOpacity,
  lampBeaconWorldDiameter,
} from "../games/make-a-mess/src/game/lampBeacon.ts";

const beacon = {
  physicalDiameter: 0.8,
  minScreenDiameter: 6,
  maxWorldDiameter: 1.8,
  dayOpacity: 0.65,
  nightOpacity: 1,
};

test("a beacon keeps its physical size nearby and a minimum angular size far away", () => {
  assert.equal(lampBeaconWorldDiameter(beacon, 5, 1080, 75), 0.8);

  const farDistance = 100;
  const farDiameter = lampBeaconWorldDiameter(beacon, farDistance, 720, 75);
  const projectedPixels =
    (farDiameter * 720) / (2 * farDistance * Math.tan((75 * Math.PI) / 360));
  assert.equal(projectedPixels >= beacon.minScreenDiameter - 1e-9, true);
  assert.equal(farDiameter <= beacon.maxWorldDiameter, true);
  assert.equal(
    lampBeaconWorldDiameter(beacon, 1_000, 720, 75),
    beacon.maxWorldDiameter,
  );
});

test("a navigation beacon remains lit by day and brightens at night", () => {
  assert.equal(lampBeaconOpacity(beacon, 0), beacon.dayOpacity);
  assert.equal(lampBeaconOpacity(beacon, 1), beacon.nightOpacity);
  assert.equal(
    lampBeaconOpacity(beacon, 0.5),
    (beacon.dayOpacity + beacon.nightOpacity) / 2,
  );
});
