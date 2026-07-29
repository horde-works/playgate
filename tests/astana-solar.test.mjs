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

test("equinox dawn and sunset make Baiterek's shadow tell the city axis", () => {
  const dawn = equinoxSunDirection(TIME_OF_DAY_TARGETS.dawn, frame);
  const sunset = equinoxSunDirection(TIME_OF_DAY_TARGETS.sunset, frame);
  const dawnShadow = horizontal([-dawn[0], -dawn[1], -dawn[2]]);
  const sunsetShadow = horizontal([-sunset[0], -sunset[1], -sunset[2]]);

  assert.ok(dot2(horizontal(dawn), ASTANA_TRUE_EAST_VECTOR) > 1 - 1e-12,
    "dawn light must arrive from Khan Shatyr");
  assert.ok(dot2(dawnShadow, ASTANA_TRUE_EAST_VECTOR) < -1 + 1e-12,
    "dawn shadow must point exactly away from Khan Shatyr");
  assert.ok(dot2(horizontal(sunset), ASTANA_TRUE_EAST_VECTOR) < -1 + 1e-12,
    "sunset light must arrive from the opposite end of the axis");
  assert.ok(dot2(sunsetShadow, ASTANA_TRUE_EAST_VECTOR) > 1 - 1e-12,
    "sunset shadow must point exactly toward Khan Shatyr");
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
