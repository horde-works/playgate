import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OBSERVATION_ORBIT,
  OBSERVATION_ELEVATION_LIMIT,
  OBSERVATION_RADIUS_MAX,
  OBSERVATION_RADIUS_MIN,
  observationCameraOffset,
  observationOrbitFromOffset,
  rotateObservationOrbit,
  zoomObservationOrbit,
} from "../games/make-a-mess/src/game/vehicleObservationOrbit.ts";

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected} (±${tolerance})`,
  );
};

test("orbit seeds from the actual camera offset and survives a round trip", () => {
  const seed = [12, 9, -17];
  const orbit = observationOrbitFromOffset(seed);
  const offset = observationCameraOffset(orbit);
  closeTo(offset[0], seed[0], 1e-9);
  closeTo(offset[1], seed[1], 1e-9);
  closeTo(offset[2], seed[2], 1e-9);
});

test("degenerate seed offset falls back to the default orbit, not NaN", () => {
  const orbit = observationOrbitFromOffset([0, 0, 0]);
  assert.deepEqual(orbit, DEFAULT_OBSERVATION_ORBIT);
  const offset = observationCameraOffset(orbit);
  assert.ok(offset.every(Number.isFinite));
});

test("seeding clamps a far player into the working radius range", () => {
  const far = observationOrbitFromOffset([300, 40, 0]);
  assert.equal(far.radius, OBSERVATION_RADIUS_MAX);
  const near = observationOrbitFromOffset([0.4, 0.1, 0.2]);
  assert.equal(near.radius, OBSERVATION_RADIUS_MIN);
});

test("rotation matches MouseLook signs: right drag orbits right, up drag climbs", () => {
  const start = observationOrbitFromOffset([0, 0, 20]);
  const right = rotateObservationOrbit(start, 100, 0);
  assert.ok(right.azimuth < start.azimuth);
  const up = rotateObservationOrbit(start, 0, -100);
  assert.ok(up.elevation > start.elevation);
  assert.equal(up.radius, start.radius);
});

test("elevation never reaches zenith or nadir", () => {
  let orbit = observationOrbitFromOffset([0, 0, 20]);
  for (let i = 0; i < 50; i += 1) {
    orbit = rotateObservationOrbit(orbit, 0, -10_000);
  }
  assert.equal(orbit.elevation, OBSERVATION_ELEVATION_LIMIT);
  for (let i = 0; i < 50; i += 1) {
    orbit = rotateObservationOrbit(orbit, 0, 10_000);
  }
  assert.equal(orbit.elevation, -OBSERVATION_ELEVATION_LIMIT);
});

test("zoom is multiplicative, symmetric and clamped", () => {
  const start = observationOrbitFromOffset([0, 0, 20]);
  const out = zoomObservationOrbit(start, 100);
  const back = zoomObservationOrbit(out, -100);
  assert.ok(out.radius > start.radius);
  closeTo(back.radius, start.radius, 1e-9);
  let orbit = start;
  for (let i = 0; i < 100; i += 1) {
    orbit = zoomObservationOrbit(orbit, -1_000);
  }
  assert.equal(orbit.radius, OBSERVATION_RADIUS_MIN);
  for (let i = 0; i < 100; i += 1) {
    orbit = zoomObservationOrbit(orbit, 1_000);
  }
  assert.equal(orbit.radius, OBSERVATION_RADIUS_MAX);
});

test("camera offset preserves the orbit radius at any angles", () => {
  const orbit = rotateObservationOrbit(
    observationOrbitFromOffset([5, 14, -8]),
    321,
    -123,
  );
  const offset = observationCameraOffset(orbit);
  closeTo(Math.hypot(...offset), orbit.radius, 1e-9);
});
