import assert from "node:assert/strict";
import test from "node:test";
import {
  kallurAirshipBellyY,
  kallurAirshipObject,
  kallurAirshipParts,
  KALLUR_AIRSHIP_AXIS_Y,
  KALLUR_AIRSHIP_FLOOR_TOP,
  KALLUR_AIRSHIP_LENGTH,
  KALLUR_AIRSHIP_RADIUS,
  KALLUR_AIRSHIP_SCALE,
} from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";

const meshParts = kallurAirshipParts.filter((part) => part.kind === "mesh");

function meshBounds(part) {
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const vertex of part.vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], vertex[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], vertex[axis]);
    }
  }
  return bounds;
}

function signedVolume(part) {
  let volume = 0;
  for (const [a, b, c] of part.triangles) {
    const [ax, ay, az] = part.vertices[a];
    const [bx, by, bz] = part.vertices[b];
    const [cx, cy, cz] = part.vertices[c];
    volume += (ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

test("airship: budget, unique ids, non-degenerate meshes", () => {
  assert.ok(kallurAirshipParts.length <= 70,
    `${kallurAirshipParts.length} parts exceed the 70 budget`);
  const ids = new Set(kallurAirshipParts.map((part) => part.id));
  assert.equal(ids.size, kallurAirshipParts.length, "ids must be unique");
  for (const part of meshParts) {
    for (const [a, b, c] of part.triangles) {
      const va = part.vertices[a];
      const vb = part.vertices[b];
      const vc = part.vertices[c];
      const ab = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
      const ac = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      assert.ok(Math.hypot(...cross) > 1e-9,
        `${part.id} carries a degenerate triangle`);
    }
  }
});

test("airship: slender hull envelope recovered from the loft", () => {
  const hull = meshParts.find((part) => part.id === "hull-skin");
  const bounds = meshBounds(hull);
  assert.ok(Math.abs((bounds.max[2] - bounds.min[2]) - KALLUR_AIRSHIP_LENGTH) < 0.01,
    `hull length ${bounds.max[2] - bounds.min[2]}`);
  assert.ok(Math.abs((bounds.max[0] - bounds.min[0]) - KALLUR_AIRSHIP_RADIUS * 2) < 0.03,
    `hull width ${bounds.max[0] - bounds.min[0]}`);
  const fineness = KALLUR_AIRSHIP_LENGTH / (bounds.max[0] - bounds.min[0]);
  assert.ok(fineness > 4.6 && fineness < 6.5,
    `fineness ${fineness.toFixed(2)} is outside the Hindenburg family (a01 chubby 3.9 rejected)`);
  assert.ok(Math.abs((bounds.max[1] + bounds.min[1]) / 2 - KALLUR_AIRSHIP_AXIS_Y) < 0.03,
    "hull is centred on the axis height");
  const volume = signedVolume(hull);
  const scaledRange = [14 * KALLUR_AIRSHIP_SCALE ** 3, 30 * KALLUR_AIRSHIP_SCALE ** 3];
  assert.ok(volume > scaledRange[0] && volume < scaledRange[1],
    `hull must close outward: signed volume ${volume.toFixed(1)}`);
});

test("airship: skids sit exactly on the y=0 platform datum", () => {
  const skids = kallurAirshipParts.filter(
    (part) => part.kind === "cylinder" && part.id.startsWith("skid-") &&
      !part.id.includes("strut"),
  );
  assert.equal(skids.length, 2);
  for (const skid of skids) {
    const bottom = Math.min(skid.from[1], skid.to[1]) - skid.radius;
    assert.ok(Math.abs(bottom) < 1e-6, `${skid.id} bottom at ${bottom}`);
  }
});

test("airship: the pod is MERGED - wall tops bury into the hull belly", () => {
  const pod = meshParts.find((part) => part.id === "gondola-pod");
  const canopy = meshParts.find((part) => part.id === "gondola-canopy");
  assert.ok(pod && canopy);
  // Recover per-z wall tops from the emitted geometry: at each sampled z
  // in the cabin range, the highest pod/canopy vertex near that z must
  // reach past the hull belly at its own x.
  for (const author of [2.2, 1.4, 0.9, 0.3, -0.5, -1.3, -2.2, -3.1]) {
    const z = author * KALLUR_AIRSHIP_SCALE;
    let best = null;
    for (const source of [pod, canopy]) {
      for (const vertex of source.vertices) {
        if (Math.abs(vertex[2] - z) > 0.12 * KALLUR_AIRSHIP_SCALE) continue;
        if (!best || vertex[1] > best[1]) best = vertex;
      }
    }
    assert.ok(best, `no pod vertices near z=${z}`);
    const belly = kallurAirshipBellyY(best[0], best[2]);
    assert.ok(best[1] > belly + 0.05,
      `pod top ${best[1].toFixed(2)} at z=${z} hangs below the belly ${belly.toFixed(2)}`);
  }
});

test("airship: the doorway is a REAL void with the sliding door outside", () => {
  const pod = meshParts.find((part) => part.id === "gondola-pod");
  // No pod facet may live inside the doorway window: |x| near the wall
  // plane, z inside the opening, y between sill and head.
  for (const [a, b, c] of pod.triangles) {
    const centroid = [0, 1, 2].map((axis) =>
      (pod.vertices[a][axis] + pod.vertices[b][axis] + pod.vertices[c][axis]) / 3);
    const S = KALLUR_AIRSHIP_SCALE;
    const inDoorway = Math.abs(centroid[0]) > 0.55 * S &&
      centroid[2] > -1.2 * S && centroid[2] < -0.6 * S &&
      centroid[1] > 1.12 * S && centroid[1] < 1.82 * S;
    assert.ok(!inDoorway,
      `pod facet walls over the doorway at ${centroid.map((v) => v.toFixed(2))}`);
  }
  const doors = kallurAirshipParts.filter((part) => part.id.startsWith("door-"));
  assert.equal(doors.length, 6, "two sliding doors of three parts each");
  for (const door of doors) {
    assert.ok(Math.abs(door.center[0]) > 0.68 * KALLUR_AIRSHIP_SCALE,
      `${door.id} must ride outside the wall plane`);
  }
});

test("airship: no main rotor above the cabin (rejection condition)", () => {
  for (const part of kallurAirshipParts) {
    if (!part.id.startsWith("prop-")) continue;
    assert.ok(Math.abs(part.center[0]) > 1.2 * KALLUR_AIRSHIP_SCALE,
      `${part.id} sits on the centreline like a main rotor`);
  }
});

test("airship: glazing lives only in the glazing group, wrap canopy exists", () => {
  for (const part of kallurAirshipParts) {
    if (part.material === "glazing") {
      assert.equal(part.group, "airship-glazing", part.id);
    }
    if (part.group === "airship-glazing") {
      assert.equal(part.material, "glazing", part.id);
    }
  }
  const canopy = meshParts.find((part) => part.id === "gondola-canopy");
  const bounds = meshBounds(canopy);
  assert.ok(bounds.max[2] > 2.0 * KALLUR_AIRSHIP_SCALE,
    "the wrap canopy must reach the cockpit nose");
  assert.ok(bounds.min[2] < 0.6 * KALLUR_AIRSHIP_SCALE,
    "the side window band must be glazed");
  assert.ok(canopy.triangles.length >= 20, "canopy is a wrap, not a porthole");
});

test("airship: fins root inside the hull and required views exist", () => {
  const fins = meshParts.filter((part) => part.group === "airship-fins");
  assert.equal(fins.length, 4);
  for (const fin of fins) {
    const bounds = meshBounds(fin);
    const nearestAxis = Math.min(
      Math.abs(bounds.min[0]) + Math.abs(bounds.min[1] - KALLUR_AIRSHIP_AXIS_Y),
      Math.abs(bounds.max[0]) + Math.abs(bounds.max[1] - KALLUR_AIRSHIP_AXIS_Y),
    );
    assert.ok(nearestAxis < KALLUR_AIRSHIP_RADIUS,
      `${fin.id} floats off the hull`);
  }
  const viewIds = new Set(kallurAirshipObject.views.map((view) => view.id));
  for (const required of [
    "front", "profile", "rear", "three-quarter", "tail-three-quarter",
    "high-three-quarter", "gondola-detail", "gondola-cutaway",
  ]) {
    assert.ok(viewIds.has(required), `missing view ${required}`);
  }
});

test("airship: a 1.62 m villager stands in the cabin with margin", () => {
  // Recovered, not restated: ceiling = the hull belly over the cabin
  // centreline, floor = the exported world-scale floor top.
  for (const z of [1.0, 0.4, -0.4]) {
    const headroom = kallurAirshipBellyY(0, z) - KALLUR_AIRSHIP_FLOOR_TOP;
    assert.ok(headroom >= 1.62 + 0.1,
      `headroom ${headroom.toFixed(2)} at z=${z} cannot take a standing villager`);
  }
});
