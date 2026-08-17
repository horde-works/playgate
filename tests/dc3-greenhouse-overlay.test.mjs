import assert from "node:assert/strict";
import test from "node:test";
import { dc3BlockoutObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import {
  dc3GreenhouseOverlayModel,
  dc3GreenhouseOverlayParts,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3GreenhouseOverlay.ts";
import { islandAirportDc3Group } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";

test("greenhouse overlay does not enter the canonical airframe or the airport", () => {
  assert.equal(
    dc3BlockoutObject.parts.some((part) => part.group === "greenhouse-overlay"),
    false,
  );
  assert.equal(
    islandAirportDc3Group.objects.some((object) => object.id.startsWith("greenhouse-")),
    false,
  );
  assert.equal(islandAirportDc3Group.objects.length, dc3AirframeParts().length);
});

test("overlay is one connected cage with glass in its six openings", () => {
  const glass = dc3GreenhouseOverlayParts.filter((part) => part.material === "glazing");
  const frames = dc3GreenhouseOverlayParts.filter((part) => part.kind === "beam");
  assert.equal(glass.length, 6);
  assert.equal(frames.length, 19, "six sill + six head + seven posts");
  assert.ok(glass.every((part) => part.kind === "mesh" && part.doubleSided === true));
  assert.ok(dc3GreenhouseOverlayParts.every((part) => part.group === "greenhouse-overlay"));
  const ends = frames.flatMap((part) => [part.from, part.to].map((point) => point.map((value) => Math.round(value * 1000)).join(",")));
  assert.equal(new Set(ends).size, 14, "nine sill/head stations, each used twice as a post");
});

test("diagnostic capture model keeps the B01 loft and only adds the overlay", () => {
  assert.equal(dc3GreenhouseOverlayModel.id, "douglas-dc3-greenhouse-overlay");
  assert.ok(dc3GreenhouseOverlayModel.sourceNotes.some((note) => note.includes("DIAGNOSTIC")));
  assert.equal(
    dc3GreenhouseOverlayModel.parts.length,
    dc3BlockoutObject.parts.length + dc3GreenhouseOverlayParts.length,
  );
  assert.ok(dc3GreenhouseOverlayModel.parts.some((part) => part.id === "fuselage-loft"));
  assert.ok(dc3GreenhouseOverlayModel.views.some((view) => view.id === "greenhouse-detail"));
  assert.ok(dc3GreenhouseOverlayModel.views.some((view) => view.id === "greenhouse-cage"));
});
