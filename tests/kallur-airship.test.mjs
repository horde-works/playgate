import assert from "node:assert/strict";
import test from "node:test";
import {
  kallurAirshipBellyY,
  kallurAirshipHullRadius,
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

function boxCorners(center, size, rotation) {
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const rx = rotation?.[0] ?? 0;
  const ry = rotation?.[1] ?? 0;
  const rz = rotation?.[2] ?? 0;
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * hx;
        let y = sy * hy;
        let z = sz * hz;
        const cx = Math.cos(rx);
        const sxr = Math.sin(rx);
        const y1 = cx * y - sxr * z;
        const z1 = sxr * y + cx * z;
        const cy = Math.cos(ry);
        const syr = Math.sin(ry);
        const x2 = cy * x + syr * z1;
        const z2 = -syr * x + cy * z1;
        const cz = Math.cos(rz);
        const szr = Math.sin(rz);
        corners.push([
          center[0] + cz * x2 - szr * y1,
          center[1] + szr * x2 + cz * y1,
          center[2] + z2,
        ]);
      }
    }
  }
  return corners;
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
  const struts = kallurAirshipParts.filter((part) =>
    part.kind === "cylinder" && part.id.includes("skid-strut"));
  assert.equal(struts.length, 4);
  for (const strut of struts) {
    const side = Math.sign(strut.to[0]);
    const skid = skids.find((part) => Math.sign(part.from[0]) === side);
    const foot = [strut.to[0] - skid.from[0], strut.to[1] - skid.from[1]];
    assert.ok(Math.hypot(...foot) <= skid.radius + 1e-6,
      `${strut.id} foot misses the skid tube by ${
        (Math.hypot(...foot) - skid.radius).toFixed(3)
      } m`);
    const along = strut.to[2];
    const z0 = Math.min(skid.from[2], skid.to[2]);
    const z1 = Math.max(skid.from[2], skid.to[2]);
    assert.ok(along >= z0 && along <= z1, `${strut.id} lands off the skid length`);
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

test("airship: two blades per side sit outboard, never on the cabin axis", () => {
  const blades = kallurAirshipParts.filter((part) =>
    /engine:-?1:blade:-?1/.test(part.id));
  assert.equal(blades.length, 4);
  for (const part of blades) {
    if (part.kind !== "box") continue;
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
    "the canopy must reach the cockpit nose");
  assert.ok(bounds.min[2] < 0.6 * KALLUR_AIRSHIP_SCALE,
    "the side window band must be glazed");
  assert.ok(canopy.triangles.length >= 20, "canopy is a wrap, not a porthole");
});

test("airship: nose glass follows the hull belly, not a helicopter visor", () => {
  const canopy = meshParts.find((part) => part.id === "gondola-canopy");
  const bury = 0.12 * KALLUR_AIRSHIP_SCALE;
  for (const authorZ of [2.68, 2.48, 2.2]) {
    const z = authorZ * KALLUR_AIRSHIP_SCALE;
    let highest = null;
    for (const vertex of canopy.vertices) {
      if (Math.abs(vertex[2] - z) > 0.18 * KALLUR_AIRSHIP_SCALE) continue;
      if (!highest || vertex[1] > highest[1]) highest = vertex;
    }
    assert.ok(highest, `no canopy at z=${authorZ}`);
    const belly = kallurAirshipBellyY(highest[0], highest[2]);
    assert.ok(highest[1] > belly,
      `glass at z=${authorZ} hangs below the hull (${highest[1].toFixed(2)} vs belly ${belly.toFixed(2)})`);
    assert.ok(highest[1] < belly + bury + 0.08 * KALLUR_AIRSHIP_SCALE,
      `glass at z=${authorZ} stands off the hull as a visor (${highest[1].toFixed(2)} vs belly ${belly.toFixed(2)})`);
  }
  for (const vertex of canopy.vertices) {
    if (vertex[2] > 2.62 * KALLUR_AIRSHIP_SCALE) {
      assert.ok(vertex[1] > 1.42 * KALLUR_AIRSHIP_SCALE,
        `glass spike below the chin at ${vertex.join(",")}`);
    }
  }
});

test("airship: blades are one diameter through the hub, and the disk misses the hull", () => {
  const blades = kallurAirshipParts.filter((part) =>
    part.kind === "box" && /engine:-?1:blade:-?1/.test(part.id));
  assert.equal(blades.length, 4);
  const nacelles = kallurAirshipParts.filter((part) =>
    part.kind === "cylinder" && part.id.endsWith(":nacelle"));
  const spinners = kallurAirshipParts.filter((part) =>
    part.kind === "cylinder" && part.id.endsWith(":spinner"));
  for (const part of blades) {
    assert.ok(Math.abs(part.rotation[1]) >= 0.25,
      `${part.id} is a face-on plank, not a pitched blade`);
    assert.ok(part.size[2] < part.size[0],
      `${part.id} is a thick slab along the shaft, not a thin diameter`);
  }
  for (const nacelle of nacelles) {
    const prefix = nacelle.id.replace(":nacelle", "");
    const sideBlades = blades.filter((blade) => blade.id.startsWith(prefix));
    const spinner = spinners.find((part) => part.id.startsWith(prefix));
    const hub = [
      nacelle.from[0],
      nacelle.from[1],
      sideBlades[0].center[2],
    ];
    const mid = [0, 1, 2].map((axis) =>
      (sideBlades[0].center[axis] + sideBlades[1].center[axis]) / 2);
    assert.ok(Math.hypot(mid[0] - hub[0], mid[1] - hub[1]) < 0.02,
      `${prefix} blades do not meet on one line through the hub`);
    const a = [
      sideBlades[0].center[0] - hub[0],
      sideBlades[0].center[1] - hub[1],
    ];
    const b = [
      sideBlades[1].center[0] - hub[0],
      sideBlades[1].center[1] - hub[1],
    ];
    const dot = (a[0] * b[0] + a[1] * b[1])
      / (Math.hypot(...a) * Math.hypot(...b));
    assert.ok(dot < -0.98, `${prefix} blades are not 180° apart`);
    for (const blade of sideBlades) {
      const radial = Math.hypot(
        blade.center[0] - hub[0],
        blade.center[1] - hub[1],
      );
      const inner = radial - blade.size[1] / 2;
      assert.ok(inner < spinner.radius,
        `${blade.id} root sits ${inner.toFixed(3)} m outside the spinner`);
      const z0 = Math.min(spinner.from[2], spinner.to[2]);
      const z1 = Math.max(spinner.from[2], spinner.to[2]);
      assert.ok(blade.center[2] >= z0 && blade.center[2] <= z1,
        `${blade.id} sits in front of the hub, not in the shaft`);
    }
  }

  const half = KALLUR_AIRSHIP_LENGTH / 2;
  let worst = Infinity;
  for (const nacelle of nacelles) {
    const prefix = nacelle.id.replace(":nacelle", "");
    const sideBlades = blades.filter((blade) => blade.id.startsWith(prefix));
    const hub = [nacelle.from[0], nacelle.from[1], sideBlades[0].center[2]];
    for (let deg = 0; deg < 360; deg += 5) {
      const angle = deg * Math.PI / 180;
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      for (const blade of sideBlades) {
        for (const corner of boxCorners(blade.center, blade.size, blade.rotation)) {
          const x = corner[0] - hub[0];
          const y = corner[1] - hub[1];
          const point = [hub[0] + cs * x - sn * y, hub[1] + sn * x + cs * y, corner[2]];
          const dist = Math.hypot(point[0], point[1] - KALLUR_AIRSHIP_AXIS_Y);
          const hull = kallurAirshipHullRadius(half - point[2]);
          worst = Math.min(worst, dist - hull);
        }
      }
    }
  }
  assert.ok(worst > 0.12,
    `inboard tip chops the envelope by ${(-worst).toFixed(3)} m through a revolution`);
});

test("airship: the nacelle hangs on the outrigger, not beside it", () => {
  const nacelles = kallurAirshipParts.filter((part) =>
    part.kind === "cylinder" && part.id.endsWith(":nacelle"));
  const pylons = kallurAirshipParts.filter((part) =>
    part.kind === "beam" && part.id.includes(":pylon:"));
  const wings = kallurAirshipParts.filter((part) => part.id.endsWith(":wing"));
  assert.equal(pylons.length, 6, "upper-fore, upper-aft and lower stay per side");
  assert.equal(wings.length, 2);
  for (const pylon of pylons) {
    const side = pylon.id.includes("engine:1:") ? "engine:1:nacelle" : "engine:-1:nacelle";
    const nacelle = nacelles.find((part) => part.id === side);
    const radial = Math.hypot(
      pylon.to[0] - nacelle.from[0],
      pylon.to[1] - nacelle.from[1],
    );
    const z0 = Math.min(nacelle.from[2], nacelle.to[2]);
    const z1 = Math.max(nacelle.from[2], nacelle.to[2]);
    assert.ok(radial <= nacelle.radius,
      `${pylon.id} ends ${ (radial - nacelle.radius).toFixed(3) } m short of the cowling`);
    assert.ok(pylon.to[2] >= z0 - 0.02 && pylon.to[2] <= z1 + 0.02,
      `${pylon.id} misses the nacelle along the shaft`);
  }
  for (const wing of wings) {
    const side = Math.sign(wing.center[0]);
    const nacelle = nacelles.find((part) => Math.sign(part.from[0]) === side);
    const inboard = Math.abs(wing.center[0]) - wing.size[0] / 2;
    const outboard = Math.abs(wing.center[0]) + wing.size[0] / 2;
    const hull = kallurAirshipHullRadius(KALLUR_AIRSHIP_LENGTH / 2 - wing.center[2]);
    const nacelleInboard = Math.abs(nacelle.from[0]) - nacelle.radius;
    assert.ok(inboard < hull,
      `${wing.id} does not bury into the hull`);
    assert.ok(outboard > nacelleInboard,
      `${wing.id} does not reach the nacelle`);
  }
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
