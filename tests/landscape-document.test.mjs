import assert from "node:assert/strict";
import test from "node:test";
import { createLandscapeSampler } from "../games/make-a-mess/src/content/landscape/landscapeSampler.ts";
import { dutchPolderLandscapeDocument } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";
import {
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_OBJECT_RESERVES,
  DUTCH_POLDER_ROUTES,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";

const sampler = createLandscapeSampler(dutchPolderLandscapeDocument);

test("landscape document keeps paths as surface masks and excludes water", () => {
  assert.equal(dutchPolderLandscapeDocument.water, "none");
  assert.equal(dutchPolderLandscapeDocument.corridors.length, DUTCH_POLDER_ROUTES.length);
  assert.ok(dutchPolderLandscapeDocument.corridors.every((corridor) => corridor.surface === "path"));
  assert.equal(JSON.stringify(dutchPolderLandscapeDocument).includes("waterSurface"), false);
});

test("construction pads preserve accepted object elevations", () => {
  for (const reserve of DUTCH_POLDER_OBJECT_RESERVES) {
    const sample = sampler.sample(...reserve.position);
    assert.ok(Math.abs(sample.elevation - reserve.baseY) < 1e-9, reserve.id);
    assert.equal(sample.groundKind, "land", reserve.id);
  }
});

test("path confirmation is a feathered mask, not authored geometry", () => {
  const route = DUTCH_POLDER_ROUTES.find(({ id }) => id === "central-to-sawyard");
  const from = route.points[1];
  const to = route.points[2];
  const x = (from[0] + to[0]) / 2;
  const y = (from[1] + to[1]) / 2;
  const z = (from[2] + to[2]) / 2;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const centre = sampler.sample(x, z);
  const outside = sampler.sample(x - dz / length * 5, z + dx / length * 5);
  assert.equal(centre.surface, "path");
  assert.equal(centre.pathWeight, 1);
  assert.ok(Math.abs(centre.elevation - y) < 1e-9);
  assert.equal(outside.pathWeight, 0);
});

test("dry channels expose bed, bank and terrace as one descending cross-section", () => {
  const channel = DUTCH_POLDER_CHANNELS.find(({ id }) => id === "C3-field-drain");
  const x = channel.points[1][0];
  const z = channel.points[1][1];
  const bed = sampler.sample(x, z);
  const bank = sampler.sample(x + channel.width / 2 + 0.9, z);
  const terrace = sampler.sample(x + channel.width / 2 + 1.8 + 1.3, z);
  const land = sampler.sample(x + channel.width / 2 + 1.8 + 2.6 + 1, z);
  assert.deepEqual([bed.groundKind, bank.groundKind, terrace.groundKind, land.groundKind], [
    "bed", "bank", "terrace", "land",
  ]);
  assert.ok(bed.elevation < bank.elevation);
  assert.ok(bank.elevation < terrace.elevation);
  assert.ok(terrace.elevation < land.elevation);
  assert.equal(bed.surface, "soil");
  assert.equal(bed.pathWeight, 0);
});

test("plateau transitions are continuous enough to compile as a shared mesh", () => {
  let previous = sampler.sample(-30, -40);
  let largestStep = 0;
  for (let z = -39.9; z <= 5; z += 0.1) {
    const current = sampler.sample(-30, z);
    if (
      previous.groundKind === "land" && current.groundKind === "land"
      && previous.pathWeight === 0 && current.pathWeight === 0
    ) {
      largestStep = Math.max(largestStep, Math.abs(current.elevation - previous.elevation));
    }
    previous = current;
  }
  assert.ok(largestStep < 0.16, `largest 10 cm sample step is ${largestStep.toFixed(3)} m`);
});
