import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PALACE_OPENING_SCHEDULE,
  virginLandsPalaceObject,
} from "../games/make-a-mess/src/content/objects/astana/virginLandsPalaceObject.ts";

const contour = JSON.parse(readFileSync(new URL(
  "../games/make-a-mess/docs/virgin-lands-palace/contour-contract-c01.json",
  import.meta.url,
), "utf8"));
const surface = JSON.parse(readFileSync(new URL(
  "../games/make-a-mess/docs/virgin-lands-palace/standard-elements-s01.json",
  import.meta.url,
), "utf8"));
const expected = new Map(contour.characteristics.map(({ id, value }) => [id, value]));

function boxBounds(part) {
  assert.equal(part.kind, "box", part.id);
  return {
    minX: part.center[0] - part.size[0] / 2,
    maxX: part.center[0] + part.size[0] / 2,
    minY: part.center[1] - part.size[1] / 2,
    maxY: part.center[1] + part.size[1] / 2,
    minZ: part.center[2] - part.size[2] / 2,
    maxZ: part.center[2] + part.size[2] / 2,
  };
}

function overlap(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function projectedBox(part, face) {
  const box = boxBounds(part);
  if (face === "front-z" || face === "rear-z") {
    return { u0: box.minX, u1: box.maxX, y0: box.minY, y1: box.maxY, n0: box.minZ, n1: box.maxZ };
  }
  return { u0: box.minZ, u1: box.maxZ, y0: box.minY, y1: box.maxY, n0: box.minX, n1: box.maxX };
}

function apertureOverlap(part, face, aperture) {
  const projected = projectedBox(part, face);
  return overlap(
    projected.u0,
    projected.u1,
    aperture.centerU - aperture.width / 2,
    aperture.centerU + aperture.width / 2,
  ) > 1e-6 && overlap(
    projected.y0,
    projected.y1,
    aperture.centerY - aperture.height / 2,
    aperture.centerY + aperture.height / 2,
  ) > 1e-6;
}

test("D02 preserves the accepted C01 mass contract", () => {
  assert.equal(virginLandsPalaceObject.dimensions.foyerWidth, expected.get("scene-overall-width"));
  assert.equal(virginLandsPalaceObject.dimensions.foyerDepth, expected.get("scene-overall-depth"));
  assert.equal(virginLandsPalaceObject.dimensions.maximumOperatingHeight, expected.get("scene-overall-height"));
  assert.equal(virginLandsPalaceObject.dimensions.auditoriumWidth, expected.get("scene-auditorium-width"));
  assert.equal(virginLandsPalaceObject.dimensions.auditoriumDepth, expected.get("scene-auditorium-depth"));
  assert.equal(virginLandsPalaceObject.dimensions.auditoriumCentreX, expected.get("scene-hall-x-offset"));
  assert.equal(virginLandsPalaceObject.dimensions.auditoriumCentreZ, expected.get("scene-hall-z-offset"));
});

test("auditorium carrier and cladding are physically absent from every aperture", () => {
  for (const [face, openings] of Object.entries(PALACE_OPENING_SCHEDULE)) {
    const opaqueFacade = virginLandsPalaceObject.parts.filter((part) =>
      part.kind === "box"
        && (part.group === `auditorium-${face}:wall`
          || part.group === `auditorium-${face}:cladding`)
    );
    assert.ok(opaqueFacade.length > 20, `${face} has no segmented facade`);
    for (const aperture of openings) {
      assert.ok(
        opaqueFacade.every((part) => !apertureOverlap(part, face, aperture)),
        `${face}:${aperture.id} is covered by opaque facade geometry`,
      );
    }
  }
});

test("each auditorium opening owns reveals, frame, finite glass and interior depth", () => {
  const openings = Object.values(PALACE_OPENING_SCHEDULE).flat();
  const panes = virginLandsPalaceObject.parts.filter((part) =>
    /auditorium-.*:openings:glazing/.test(part.group)
  );
  assert.equal(panes.length, openings.length);
  assert.ok(panes.every((part) => part.kind === "box" && part.material === "palace-glazing" && Math.min(...part.size) >= 0.04));
  for (const aperture of openings) {
    assert.ok(virginLandsPalaceObject.parts.some((part) => part.id === `${aperture.id}:reveal-left`));
    assert.ok(virginLandsPalaceObject.parts.some((part) => part.id === `${aperture.id}:frame-head`));
    assert.ok(virginLandsPalaceObject.parts.some((part) => part.id === `${aperture.id}:glass`));
    assert.ok(virginLandsPalaceObject.parts.some((part) => part.id === `${aperture.id}:interior-back`));
  }
});

test("curtain wall uses one pane per cell and reserves four real door bays", () => {
  const ordinaryPanes = virginLandsPalaceObject.parts.filter((part) =>
    /foyer-.*:pane-/.test(part.id)
  );
  const expectedOrdinary = 24 * 2 + 17 * 2 + (24 - 4) + 17;
  assert.equal(ordinaryPanes.length, expectedOrdinary);
  assert.ok(ordinaryPanes.every((part) => part.kind === "box" && part.material === "palace-glazing"));

  const doorGlass = virginLandsPalaceObject.parts.filter((part) =>
    /foyer-front-ground:door-.*:glass/.test(part.id)
  );
  assert.equal(doorGlass.length, 4);
  assert.ok(!ordinaryPanes.some((part) =>
    /foyer-front-ground:pane-(5|6|9|10)-/.test(part.id)
  ));
});

test("the curtain wall has no broad opaque backing within 1.2 metres", () => {
  const panes = virginLandsPalaceObject.parts.filter((part) =>
    part.kind === "box" && /foyer-.*:glazing/.test(part.group)
  );
  const opaqueBoxes = virginLandsPalaceObject.parts.filter((part) =>
    part.kind === "box" && part.material !== "palace-glazing"
  );
  for (const pane of panes) {
    const face = pane.id.includes("right") ? "right-x" : "front-z";
    const glass = projectedBox(pane, face);
    const paneArea = (glass.u1 - glass.u0) * (glass.y1 - glass.y0);
    for (const opaque of opaqueBoxes) {
      const candidate = projectedBox(opaque, face);
      const area = Math.max(0, overlap(glass.u0, glass.u1, candidate.u0, candidate.u1))
        * Math.max(0, overlap(glass.y0, glass.y1, candidate.y0, candidate.y1));
      if (area < paneArea * 0.8) continue;
      const normalGap = Math.max(
        0,
        Math.max(glass.n0, candidate.n0) - Math.min(glass.n1, candidate.n1),
      );
      assert.ok(normalGap >= 1.2, `${pane.id} has broad backing ${opaque.id} at ${normalGap} m`);
    }
  }
});

test("door leaves stay inside their reserved structural bays", () => {
  const leaves = virginLandsPalaceObject.parts.filter((part) =>
    part.kind === "box" && /foyer-front-ground:door-.*:glass/.test(part.id)
  );
  assert.equal(leaves.length, 4);
  for (const leaf of leaves) {
    const bounds = boxBounds(leaf);
    assert.ok(bounds.minY >= 0.18 && bounds.maxY <= 1.95);
    assert.ok(bounds.minZ > 15.45 && bounds.maxZ < 15.7);
  }
});

test("only the four accepted roof sheets use custom mesh topology", () => {
  const meshes = virginLandsPalaceObject.parts.filter((part) => part.kind === "mesh");
  assert.deepEqual(meshes.map(({ id }) => id).sort(), [...surface.standardElementPolicy.customMeshAllowlist].sort());
  assert.ok(virginLandsPalaceObject.parts.length > 500);
  assert.ok(virginLandsPalaceObject.parts.length < 1800);
});

test("transparent inventory is physical, non-emissive glass only", () => {
  const glass = virginLandsPalaceObject.parts.filter((part) => part.material === "palace-glazing");
  assert.ok(glass.length > 150);
  assert.ok(glass.every((part) => /pane|glass/.test(part.id)));
  assert.ok(glass.every((part) => part.light === undefined));
  assert.equal(virginLandsPalaceObject.motionConstraints.windowGlassEmissive, false);
});

test("the aperture test is anti-self-confirming", () => {
  const aperture = PALACE_OPENING_SCHEDULE["front-z"][0];
  const illegalBacking = {
    kind: "box",
    id: "mutation:illegal-full-front-wall",
    group: "auditorium-front-z:wall",
    material: "palace-concrete",
    center: [-5, 9.55, 7.74],
    size: [34, 8.7, 0.52],
  };
  assert.equal(apertureOverlap(illegalBacking, "front-z", aperture), true);
});

test("canonical views include paired glass cutaway and exposing details", () => {
  const ids = virginLandsPalaceObject.views.map(({ id }) => id);
  assert.deepEqual(ids, [
    "front-square", "foyer-corner", "right-grazing", "auditorium-window-detail",
    "door-detail", "high-three-quarter", "left-three-quarter", "rear", "top",
    "foyer-corner-cutaway", "silhouette",
  ]);
  const exterior = virginLandsPalaceObject.views.find(({ id }) => id === "foyer-corner");
  const cutaway = virginLandsPalaceObject.views.find(({ id }) => id === "foyer-corner-cutaway");
  assert.deepEqual(cutaway.position, exterior.position);
  assert.deepEqual(cutaway.target, exterior.target);
  assert.equal(cutaway.fov, exterior.fov);
  assert.ok(cutaway.hiddenGroups.includes("foyer-front-upper:glazing"));
});

test("all emitted parts are unique and non-degenerate", () => {
  const ids = virginLandsPalaceObject.parts.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const part of virginLandsPalaceObject.parts) {
    if (part.kind === "box") assert.ok(part.size.every((value) => value > 0.015), part.id);
    if (part.kind === "beam") assert.ok(Math.hypot(
      part.to[0] - part.from[0],
      part.to[1] - part.from[1],
      part.to[2] - part.from[2],
    ) > 0.02, part.id);
    if (part.kind === "mesh") assert.ok(part.vertices.length >= 3 && part.triangles.length >= 1, part.id);
  }
});
