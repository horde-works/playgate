// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import assert from "node:assert/strict";
import test from "node:test";
import {
  ASTANA_LATITUDE_DEGREES,
  ASTANA_TRUE_EAST_VECTOR,
  ASTANA_TRUE_NORTH_SCENE_BEARING_DEGREES,
  ASTANA_TRUE_NORTH_VECTOR,
  BAITEREK_CENTRE,
  KHAN_SHATYR_CENTRE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  TIME_OF_DAY_TARGETS,
  equinoxSunDirection,
} from "../games/make-a-mess/src/game/timeOfDay.ts";

const frame = {
  model: "equinox",
  latitudeDegrees: ASTANA_LATITUDE_DEGREES,
  east: ASTANA_TRUE_EAST_VECTOR,
  north: ASTANA_TRUE_NORTH_VECTOR,
};

const horizontal = (direction) => {
  const length = Math.hypot(direction[0], direction[2]) || 1;
  return [direction[0] / length, direction[2] / length];
};

const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

test("Astana compass rotates without moving the map", () => {
  assert.deepEqual(BAITEREK_CENTRE, [0, 0]);
  assert.deepEqual(KHAN_SHATYR_CENTRE, [49, -41]);
  assert.ok(Math.abs(Math.hypot(...ASTANA_TRUE_EAST_VECTOR) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...ASTANA_TRUE_NORTH_VECTOR) - 1) < 1e-12);
  assert.ok(Math.abs(dot2(ASTANA_TRUE_EAST_VECTOR, ASTANA_TRUE_NORTH_VECTOR)) < 1e-12);
  assert.ok(Math.abs(ASTANA_TRUE_NORTH_SCENE_BEARING_DEGREES - 39.92039213998544)
    < 1e-12);
  assert.deepEqual(astanaScene.solarFrame, frame);
});

test("equinox sunrise and sunset make Baiterek's shadow tell the city axis", () => {
  // Both ends read from RAW solar time, not from the phase wheel. The axis is
  // a property of the equinox geometry — the sun is exactly on it when it is
  // exactly on the horizon — and it must stay pinned here whatever hour the
  // day/night presets happen to park on. The sunrise half already worked this
  // way; the sunset half was reading `TIME_OF_DAY_TARGETS.sunset` and so was
  // silently asserting where that preset sat.
  const sunrise = equinoxSunDirection(0, frame);
  const sunset = equinoxSunDirection(0.5, frame);
  const sunriseShadow = horizontal([-sunrise[0], -sunrise[1], -sunrise[2]]);
  const sunsetShadow = horizontal([-sunset[0], -sunset[1], -sunset[2]]);

  assert.ok(dot2(horizontal(sunrise), ASTANA_TRUE_EAST_VECTOR) > 1 - 1e-12,
    "sunrise light must arrive from Khan Shatyr");
  assert.ok(dot2(sunriseShadow, ASTANA_TRUE_EAST_VECTOR) < -1 + 1e-12,
    "sunrise shadow must point exactly away from Khan Shatyr");
  assert.ok(dot2(horizontal(sunset), ASTANA_TRUE_EAST_VECTOR) < -1 + 1e-12,
    "sunset light must arrive from the opposite end of the axis");
  assert.ok(dot2(sunsetShadow, ASTANA_TRUE_EAST_VECTOR) > 1 - 1e-12,
    "sunset shadow must point exactly toward Khan Shatyr");
});

test("the dusk presets still stand a player on that axis", () => {
  // What the geometry above guarantees is worth nothing if no preset lands
  // near it. `sunset` sits in the golden hour and `evening` just under the
  // horizon, so neither is exactly on the axis any more — but a five-degree
  // offset is still a shadow running the length of the boulevard.
  for (const phase of ["sunset", "evening"]) {
    const sun = horizontal(equinoxSunDirection(TIME_OF_DAY_TARGETS[phase], frame));
    const offAxis = Math.acos(Math.min(1, -dot2(sun, ASTANA_TRUE_EAST_VECTOR)))
      * 180 / Math.PI;
    assert.ok(
      offAxis < 6,
      `the ${phase} sun stands ${offAxis.toFixed(1)}° off the city axis`,
    );
  }
});

test("the morning phase already stands clear of the horizon", () => {
  const dawn = equinoxSunDirection(TIME_OF_DAY_TARGETS.dawn, frame);
  const elevation = Math.atan2(dawn[1], Math.hypot(dawn[0], dawn[2])) * 180 / Math.PI;

  assert.ok(elevation > 8, `morning sun sits at ${elevation.toFixed(2)}°`);
  assert.ok(elevation < 14, `morning sun sits at ${elevation.toFixed(2)}°`);
  assert.ok(dot2(horizontal(dawn), ASTANA_TRUE_EAST_VECTOR) > 0.9,
    "morning light must still arrive along the city axis");
  assert.ok(dot2(horizontal(dawn), ASTANA_TRUE_NORTH_VECTOR) < 0,
    "the risen sun must have swung toward the south");
});

test("the rest of the day follows a physical northern-hemisphere equinox", () => {
  const morning = equinoxSunDirection(TIME_OF_DAY_TARGETS.morning, frame);
  const noon = equinoxSunDirection(TIME_OF_DAY_TARGETS.day, frame);
  const afternoon = equinoxSunDirection(TIME_OF_DAY_TARGETS.afternoon, frame);

  assert.ok(dot2(horizontal(morning), ASTANA_TRUE_EAST_VECTOR) > 0);
  assert.ok(dot2(horizontal(morning), ASTANA_TRUE_NORTH_VECTOR) < 0);
  assert.ok(Math.abs(dot2(horizontal(noon), ASTANA_TRUE_EAST_VECTOR)) < 1e-12);
  assert.ok(dot2(horizontal(noon), ASTANA_TRUE_NORTH_VECTOR) < -1 + 1e-12,
    "noon sun must be due south");
  assert.ok(dot2(horizontal(afternoon), ASTANA_TRUE_EAST_VECTOR) < 0);
  assert.ok(dot2(horizontal(afternoon), ASTANA_TRUE_NORTH_VECTOR) < 0);

  const expectedNoonElevation = 90 - ASTANA_LATITUDE_DEGREES;
  const actualNoonElevation = Math.atan2(
    noon[1],
    Math.hypot(noon[0], noon[2]),
  ) * 180 / Math.PI;
  assert.ok(Math.abs(actualNoonElevation - expectedNoonElevation) < 1e-12);
});
