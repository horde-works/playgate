import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dc3AirframeSurface,
  dc3BlockoutObject,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";

const expected = JSON.parse(readFileSync(new URL(
  "../games/make-a-mess/docs/dc-3/source-expectations-s01.json",
  import.meta.url,
), "utf8"));
const contour = JSON.parse(readFileSync(new URL(
  "../games/make-a-mess/docs/dc-3/contour-contract-c01.json",
  import.meta.url,
), "utf8"));

const published = (path) => {
  const [group, key] = path.split(".");
  return expected[group][key].value;
};

function partPoints(part) {
  if (part.kind === "box") {
    const [x, y, z] = part.center;
    const [width, height, depth] = part.size;
    return [
      [x - width / 2, y - height / 2, z - depth / 2],
      [x + width / 2, y + height / 2, z + depth / 2],
    ];
  }
  if (part.kind === "mesh") return part.vertices;
  const [ax, ay, az] = part.from;
  const [bx, by, bz] = part.to;
  const radius = part.kind === "cylinder" ? part.radius : 0;
  return [
    [ax - radius, ay - radius, az - radius],
    [bx + radius, by + radius, bz + radius],
  ];
}

function bounds(parts) {
  const points = parts.flatMap(partPoints);
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxY: Math.max(...points.map(([, y]) => y)),
    minZ: Math.min(...points.map(([, , z]) => z)),
    maxZ: Math.max(...points.map(([, , z]) => z)),
  };
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a) {
  return Math.hypot(...a);
}

function near(actual, target, tolerance, label) {
  assert.ok(
    Math.abs(actual - target) <= tolerance,
    `${label}: ${actual} not within ${tolerance} of ${target}`,
  );
}

const fuselage = dc3BlockoutObject.parts.filter((part) => part.group === "fuselage");
const wings = dc3BlockoutObject.parts.filter((part) => part.group === "wing");
const props = dc3BlockoutObject.parts.filter((part) => part.group.startsWith("propeller-"));
const wheels = dc3BlockoutObject.parts.filter((part) => /wheel$/.test(part.id));

test("B01 recovers the published type envelope from emitted parts", () => {
  const wingBox = bounds(wings);
  const all = bounds(dc3BlockoutObject.parts);
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const axisLength = length(axis);
  const unit = axis.map((value) => value / axisLength);
  const fuselagePoints = [
    ...fuselage,
    ...dc3BlockoutObject.parts.filter((part) => part.group === "nose-cap"),
  ].flatMap(partPoints);
  const along = fuselagePoints.map((point) => dot(point, unit));
  near(wingBox.maxX - wingBox.minX, published("envelope.wingspan"), 0.18, "span");
  near(Math.max(...along) - Math.min(...along), published("envelope.length"), 0.12, "length");
  near(all.maxY - Math.min(0, all.minY), published("envelope.heightTailDown"), 0.28, "height");
});

test("contour characteristics stay the published metre conversions", () => {
  const byId = new Map(contour.characteristics.map((row) => [row.id, row.value]));
  assert.equal(byId.get("wingspan"), published("envelope.wingspan"));
  assert.equal(byId.get("length"), published("envelope.length"));
  assert.equal(byId.get("height-tail-down"), published("envelope.heightTailDown"));
  assert.equal(byId.get("propeller-diameter"), published("envelope.propellerDiameter"));
});

test("each side has three blades at the published diameter", () => {
  assert.ok(!props.some((part) => /disc/.test(part.id)));
  for (const side of ["left", "right"]) {
    const blades = props.filter((part) => part.group === `propeller-${side}`);
    assert.equal(blades.length, 3, side);
    assert.ok(blades.every((part) => part.kind === "mesh"));
    const hub = dc3BlockoutObject.anchors[side === "left" ? "leftProp" : "rightProp"];
    const spinner = dc3BlockoutObject.parts.find((part) => part.id === `nacelle-${side}-spinner`);
    assert.equal(spinner.kind, "cylinder");
    const axis = subtract(spinner.to, spinner.from);
    const unit = axis.map((value) => value / length(axis));
    const radii = blades.map((blade) => Math.max(
      ...blade.vertices.map((vertex) => {
        const relative = subtract(vertex, hub);
        return length(subtract(relative, unit.map((value) => value * dot(relative, unit))));
      }),
    ));
    for (const radius of radii) {
      near(radius * 2, published("envelope.propellerDiameter"), 0.04, `${side} blade diameter`);
    }
    const east = [1, 0, 0];
    const north = [
      unit[1] * east[2] - unit[2] * east[1],
      unit[2] * east[0] - unit[0] * east[2],
      unit[0] * east[1] - unit[1] * east[0],
    ];
    const angles = blades.map((blade) => {
      const centroid = blade.vertices.reduce(
        (sum, vertex) => [sum[0] + vertex[0], sum[1] + vertex[1], sum[2] + vertex[2]],
        [0, 0, 0],
      ).map((value) => value / blade.vertices.length);
      const radial = subtract(centroid, hub);
      const plane = subtract(radial, unit.map((value) => value * dot(radial, unit)));
      return Math.atan2(dot(plane, north), dot(plane, east));
    }).sort((a, b) => a - b);
    const steps = [1, 2].map((index) => {
      let step = angles[index] - angles[index - 1];
      if (step < 0) step += Math.PI * 2;
      return step * 180 / Math.PI;
    });
    for (const step of steps) near(step, 120, 4, `${side} blade spacing`);
  }
  assert.ok(
    bounds(props.filter((part) => part.group === "propeller-left")).maxX < 0,
  );
  assert.ok(
    bounds(props.filter((part) => part.group === "propeller-right")).minX > 0,
  );
});

test("three-point gear reaches the ground", () => {
  assert.equal(wheels.length, 3);
  for (const wheel of wheels) {
    const box = bounds([wheel]);
    near(box.minY, 0, 0.08, `${wheel.id} ground`);
  }
  assert.ok(bounds(fuselage).minY > 0.12, "belly must clear the floor");
});

test("the nose holds a cabin roof, then a blunt windshield drop, with no hanging chin", () => {
  const { stations } = dc3AirframeSurface.fuselage;
  const at = (z) => stations.find((station) => Math.abs(station.z - z) < 0.05);
  const cabin = at(4.3);
  const brow = at(6.15);
  const deck = at(6.5);
  const bullet = at(6.85);
  const tip = stations.reduce((front, station) => (station.z > front.z ? station : front));
  const capMid = stations.find((station) => station.z > 7.05 && station.z < tip.z - 0.02);
  assert.ok(cabin && brow && deck && bullet && capMid, "cabin / brow / deck / bullet / cap missing");
  const noseToCabin = stations.filter((station) => station.z >= 4.3);
  for (const station of noseToCabin) {
    assert.equal(
      station.upperPower,
      undefined,
      `upperPower at z=${station.z} boxes the upper half`,
    );
    assert.equal(
      station.faceForward,
      undefined,
      `faceForward at z=${station.z} shears a fake rake`,
    );
  }
  for (let index = 1; index < noseToCabin.length; index += 1) {
    const aft = noseToCabin[index];
    const forward = noseToCabin[index - 1];
    assert.ok(
      aft.crown >= forward.crown - 1e-9,
      `crown rose toward the snout: z=${forward.z} ${forward.crown} → z=${aft.z} ${aft.crown}`,
    );
  }
  assert.ok(
    noseToCabin.every((station) => station.crown <= cabin.crown + 1e-9),
    "brow sits above the cabin roof",
  );
  const roof = stations.filter((station) => station.z >= 4.3 && station.z <= 5.9);
  assert.ok(
    roof.every((station) => station.crown >= cabin.crown - 0.04),
    "cockpit roof droops before the windshield — that is a 21st-century fairing",
  );
  const fillet = at(5.8).crown - brow.crown;
  assert.ok(fillet >= 0.05 && fillet <= 0.16, `brow fillet ${fillet} m is a knife or a fairing`);
  const drop = brow.crown - deck.crown;
  const run = deck.z - brow.z;
  assert.ok(drop >= 0.5, `windshield drop ${drop} m is still a modern slope`);
  assert.ok(run > 0 && run <= 0.4, `windshield run ${run} m is not a crease`);
  assert.ok(drop / run >= 1.2, `windshield slope ${((Math.atan(drop / run) * 180) / Math.PI).toFixed(0)}° is too raked`);
  const deckDrop = deck.crown - bullet.crown;
  const deckRun = bullet.z - deck.z;
  const deckSlope = deckDrop / deckRun;
  assert.ok(
    deckDrop >= 0.04 && deckDrop <= 0.16,
    `nose deck drop ${deckDrop} m is a shelf or the windshield`,
  );
  assert.ok(
    deckSlope >= 0.1 && deckSlope <= 0.45,
    `snout slope ${((Math.atan(deckSlope) * 180) / Math.PI).toFixed(0)}° is still the windshield or a horizon shelf`,
  );
  assert.ok(
    bullet.halfWidth >= 0.85,
    `cap ${bullet.halfWidth} m wide at z=${bullet.z} already collapsed to a sphere`,
  );
  const linearCap = deck.crown
    + ((tip.crown - deck.crown) * (capMid.z - deck.z)) / (tip.z - deck.z);
  assert.ok(
    capMid.crown > linearCap + 0.04,
    `cap is a cone, not a bullet: mid ${capMid.crown} vs linear ${linearCap}`,
  );
  assert.ok(
    tip.halfWidth > 0.18 && tip.halfWidth < 0.4,
    `cap tip ${tip.halfWidth} is a pin or a leftover disk`,
  );
  assert.ok(!dc3BlockoutObject.parts.some((part) => part.id === "nose-cap"));

  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const bodyUp = [0, unit[2], -unit[1]];
  const upLen = length(bodyUp);
  const samples = fuselage[0].vertices.filter((vertex) => Math.abs(vertex[0]) < 0.22).map((vertex) => {
    const relative = subtract(vertex, origin);
    return {
      s: dot(relative, unit) / length(axis),
      height: dot(relative, bodyUp) / upLen,
    };
  });
  const band = (from, to) => samples.filter(({ s }) => s >= from && s <= to);
  const highest = (from, to) => Math.max(...band(from, to).map(({ height }) => height));
  const lowest = (from, to) => Math.min(...band(from, to).map(({ height }) => height));
  const tipSpan = highest(0.978, 0.99) - lowest(0.978, 0.99);
  const keel = [0.986, 0.97, 0.94, 0.91, 0.88, 0.74].map((s) => lowest(s - 0.015, s + 0.015));
  assert.ok(tipSpan > 0.65, `snout ${tipSpan} is still a pin`);
  for (let index = 1; index < keel.length; index += 1) {
    assert.ok(
      keel[index] <= keel[index - 1] + 0.06,
      `chin pouch at station ${index}: keel rose from ${keel[index - 1]} to ${keel[index]}`,
    );
  }
});

test("the fuselage is a loft, not a cake", () => {
  assert.equal(fuselage.length, 1);
  assert.equal(fuselage[0].kind, "mesh");
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const samples = fuselage[0].vertices.map((vertex) => {
    const relative = subtract(vertex, origin);
    const s = dot(relative, unit) / length(axis);
    const radial = length(subtract(relative, unit.map((value) => value * dot(relative, unit))));
    return { s, radial };
  });
  const band = (from, to) => samples.filter(({ s }) => s >= from && s <= to).map(({ radial }) => radial);
  const nose = Math.max(...band(0.993, 1));
  const cabin = Math.max(...band(0.58, 0.78));
  const tail = Math.max(...band(0, 0.16));
  // The nose deck is held for the type (cap later). 2.4× assumed a pin cut
  // and would force the windshield to continue into the snout.
  assert.ok(cabin > nose * 1.8, `cabin ${cabin} must outgrow the nose tip ${nose}`);
  assert.ok(cabin > tail * 1.6, `cabin ${cabin} must outgrow the tail ${tail}`);
});

test("the fin is one surface growing from the crown, not a second tail", () => {
  const fins = dc3BlockoutObject.parts.filter((part) => part.id === "vertical-fin");
  assert.equal(fins.length, 1);
  assert.ok(!dc3BlockoutObject.parts.some((part) => part.id === "dorsal-fillet"));
  assert.equal(fins[0].kind, "mesh");
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const bodyUp = [0, unit[2], -unit[1]];
  const upLen = length(bodyUp);
  const samples = fins[0].vertices.map((vertex) => {
    const relative = subtract(vertex, origin);
    return {
      height: dot(relative, bodyUp) / upLen,
      station: dot(relative, unit),
    };
  });
  const band = (from, to) => samples.filter(({ height }) => height >= from && height <= to);
  const lead = (from, to) => Math.max(...band(from, to).map(({ station }) => station));
  const chord = (from, to) => {
    const stations = band(from, to).map(({ station }) => station);
    return Math.max(...stations) - Math.min(...stations);
  };
  const rootLead = lead(0.35, 1.15);
  const midLead = lead(2.3, 2.9);
  const tipLead = lead(4.45, 5.1);
  const tipChord = chord(4.5, 5.1);
  const rootChord = chord(0.35, 1.05);
  assert.ok(rootLead - midLead > 1.2, "dorsal fillet is missing; LE is still a straight cut");
  assert.ok(midLead > tipLead, "fin LE does not sweep aft");
  assert.ok(tipChord > 0.18, `tip ${tipChord} is still a flat bar`);
  assert.ok(rootChord > tipChord * 2.4, `root ${rootChord} does not outgrow tip ${tipChord}`);
});

test("each nacelle is a full-diameter teardrop with a Wright radial inside the cowl", () => {
  assert.ok(!dc3BlockoutObject.parts.some((part) => /fairing/.test(part.id)));
  const cylinders = expected.authored.engineCylinders.value;
  const inner = expected.authored.cowlInnerRadius.value;
  for (const side of ["left", "right"]) {
    const body = dc3BlockoutObject.parts.find((part) => part.id === `nacelle-${side}-body`);
    const engine = dc3BlockoutObject.parts.filter((part) => part.group === `engine-${side}`);
    assert.equal(body.kind, "mesh");
    const shell = bounds([body]);
    assert.ok(shell.maxY - shell.minY > 1.2, `${side} nacelle is still a flat cube`);
    assert.ok(shell.maxX - shell.minX > 1.2, `${side} nacelle is narrower than the cowl`);
    assert.equal(engine.filter((part) => /cylinder-/.test(part.id)).length, cylinders);
    const spinner = dc3BlockoutObject.parts.find((part) => part.id === `nacelle-${side}-spinner`);
    const axis = subtract(spinner.to, spinner.from);
    const unit = axis.map((value) => value / length(axis));
    const origin = dc3BlockoutObject.anchors[side === "left" ? "leftProp" : "rightProp"];
    for (const part of engine) {
      const points = part.kind === "cylinder" ? [part.from, part.to] : partPoints(part);
      for (const vertex of points) {
        const relative = subtract(vertex, origin);
        const radial = length(subtract(relative, unit.map((value) => value * dot(relative, unit))));
        assert.ok(radial < inner - 0.02, `${part.id} leaves the cowl (${radial})`);
      }
    }
    const wing = bounds(wings.filter((part) => part.id.includes(side)));
    assert.ok(shell.maxX > wing.minX && shell.minX < wing.maxX, `${side} nacelle misses the wing`);
  }
});

test("Wright cylinders do not intersect each other inside the cowl", () => {
  for (const side of ["left", "right"]) {
    const barrels = dc3BlockoutObject.parts.filter((part) =>
      part.id.startsWith(`engine-${side}-cylinder-`)
    );
    assert.equal(barrels.length, 9);
    for (let index = 0; index < barrels.length; index += 1) {
      const a = barrels[index];
      const b = barrels[(index + 1) % barrels.length];
      const innerGap = length(subtract(a.from, b.from)) - a.radius - b.radius;
      const outerGap = length(subtract(a.to, b.to)) - a.radius - b.radius;
      assert.ok(innerGap > 0.004, `${a.id} overlaps ${b.id} at the crankcase (${innerGap})`);
      assert.ok(outerGap > 0.004, `${a.id} overlaps ${b.id} at the head (${outerGap})`);
    }
  }
});

test("twin nacelles are mirrored and the study stays isolated", () => {
  const left = dc3BlockoutObject.parts.filter((part) => part.group === "nacelle-left");
  const right = dc3BlockoutObject.parts.filter((part) => part.group === "nacelle-right");
  assert.ok(left.length >= 2);
  assert.equal(left.length, right.length);
  assert.equal(dc3BlockoutObject.motionConstraints.worldIntegrationDeferred, true);
  assert.equal(dc3BlockoutObject.motionConstraints.aerodynamicsExcluded, true);
  assert.ok(!dc3BlockoutObject.parts.some((part) => /window|door|livery/.test(part.id)));
  assert.ok(!dc3BlockoutObject.parts.some((part) => /rib/.test(part.id)), "formers, not a rib id");
});

test("the airframe hangs on a three-spar wing box with frames and longerons", () => {
  const spars = ["front", "main", "rear"].map((id) => {
    const part = dc3BlockoutObject.parts.find((entry) => entry.id === `wing-spar-${id}`);
    assert.equal(part?.kind, "mesh", id);
    return part;
  });
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const meanStation = (part) => {
    const sum = part.vertices.reduce((total, vertex) => total + dot(subtract(vertex, origin), unit), 0);
    return sum / part.vertices.length;
  };
  assert.ok(meanStation(spars[0]) > meanStation(spars[1]), "front spar is not ahead of the main spar");
  assert.ok(meanStation(spars[1]) > meanStation(spars[2]), "main spar is not ahead of the rear spar");
  for (const spar of spars) {
    const box = bounds([spar]);
    assert.ok(box.maxX - box.minX > 26, `${spar.id} does not run tip-to-tip`);
    const wingBox = bounds(wings);
    assert.ok(box.minY > wingBox.minY - 0.08 && box.maxY < wingBox.maxY + 0.08, `${spar.id} leaves the wing`);
  }
  const frames = dc3BlockoutObject.parts.filter((part) => part.group === "structure-fuselage" && /^fuselage-frame-/.test(part.id));
  const longerons = dc3BlockoutObject.parts.filter((part) => /^longeron-/.test(part.id));
  const stringers = dc3BlockoutObject.parts.filter((part) => /^stringer-/.test(part.id));
  const formers = dc3BlockoutObject.parts.filter((part) => /^wing-former-/.test(part.id));
  assert.ok(frames.length >= 8, `only ${frames.length} fuselage frames`);
  assert.equal(longerons.length, 4);
  assert.ok(stringers.length >= 8, `only ${stringers.length} stringers to hang the skin`);
  assert.ok(formers.length >= 15, `only ${formers.length} wing formers`);
});

test("the cage sits inside the skins, not on the mold line", () => {
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const bodyUp = [0, unit[2], -unit[1]];
  const upLen = length(bodyUp);
  const locate = (vertex) => {
    const relative = subtract(vertex, origin);
    return {
      s: dot(relative, unit) / length(axis),
      h: dot(relative, bodyUp) / upLen,
      x: vertex[0],
    };
  };
  const inBand = (parts, from, to) => parts.flatMap(partPoints).map(locate).filter(({ s }) => s >= from && s <= to);
  const extent = (samples) => ({
    minX: Math.min(...samples.map(({ x }) => x)),
    maxX: Math.max(...samples.map(({ x }) => x)),
    minH: Math.min(...samples.map(({ h }) => h)),
    maxH: Math.max(...samples.map(({ h }) => h)),
  });
  const cage = dc3BlockoutObject.parts.filter((part) => part.group === "structure-fuselage");
  for (const [from, to] of [[0.15, 0.25], [0.45, 0.55], [0.75, 0.85]]) {
    const skin = inBand(fuselage, from, to);
    const core = inBand(cage, from, to);
    assert.ok(skin.length > 8 && core.length > 8, `empty band ${from}-${to}`);
    const outer = extent(skin);
    const inner = extent(core);
    assert.ok(inner.maxX < outer.maxX - 0.05, `right rail on the skin at ${from}`);
    assert.ok(inner.minX > outer.minX + 0.05, `left rail on the skin at ${from}`);
    assert.ok(inner.maxH < outer.maxH - 0.05, `crown rail on the skin at ${from}`);
    assert.ok(inner.minH > outer.minH + 0.05, `keel rail on the skin at ${from}`);
  }
  const wingCage = dc3BlockoutObject.parts.filter((part) => part.group === "structure-wing");
  const wingSkin = bounds(wings);
  const wingCore = bounds(wingCage);
  assert.ok(wingCore.maxX < wingSkin.maxX - 0.08, "wing cage reaches the tip skin");
  assert.ok(wingCore.minX > wingSkin.minX + 0.08, "wing cage reaches the tip skin");
  assert.ok(wingCore.maxY < wingSkin.maxY - 0.02, "spar sits on the upper skin");
  assert.ok(wingCore.minY > wingSkin.minY + 0.02, "spar sits on the lower skin");
});

test("engine mounts and gear trunnions pick up the front spar", () => {
  for (const side of ["left", "right"]) {
    const stays = dc3BlockoutObject.parts.filter((part) => part.id.startsWith(`mount-${side}-stay-`));
    assert.equal(stays.length, 4);
    const backstay = dc3BlockoutObject.parts.find((part) => part.id === `mount-${side}-backstay`);
    const trunnion = dc3BlockoutObject.parts.find((part) => part.id === `mount-${side}-trunnion`);
    const strut = dc3BlockoutObject.parts.find((part) => part.id === `gear-${side}-strut`);
    const crank = dc3BlockoutObject.parts.find((part) => part.id === `engine-${side}-crankcase`);
    assert.equal(backstay.kind, "cylinder");
    assert.equal(trunnion.kind, "cylinder");
    const crankMid = [
      (crank.from[0] + crank.to[0]) / 2,
      (crank.from[1] + crank.to[1]) / 2,
      (crank.from[2] + crank.to[2]) / 2,
    ];
    const stayReach = Math.min(...stays.map((stay) => length(subtract(stay.to, crankMid))));
    assert.ok(stayReach < 0.2, `${side} mount misses the crankcase`);
    assert.ok(length(subtract(trunnion.to, strut.from)) < 0.12, `${side} trunnion misses the gear strut`);
  }
});

test("cutaway views hide skins only and keep an identical closed twin", () => {
  const views = dc3BlockoutObject.views;
  const skins = ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"];
  for (const id of ["right-profile", "high-three-quarter", "core-detail"]) {
    const exterior = views.find((view) => view.id === id);
    const cutaway = views.find((view) => view.id === `${id}-cutaway`);
    assert.ok(exterior && cutaway, id);
    assert.deepEqual(cutaway.position, exterior.position);
    assert.deepEqual(cutaway.target, exterior.target);
    assert.equal(cutaway.projection, exterior.projection);
    assert.equal(cutaway.orthoHeight ?? cutaway.fov, exterior.orthoHeight ?? exterior.fov);
    assert.equal(exterior.hiddenGroups, undefined);
    assert.deepEqual(cutaway.hiddenGroups, skins);
  }
  assert.ok(dc3BlockoutObject.parts.some((part) => part.group.startsWith("structure-")));
  assert.ok(!dc3BlockoutObject.parts.some((part) => part.material === "glazing"));
});

test("required engineering views are present and unique ids stay non-degenerate", () => {
  const ids = dc3BlockoutObject.views.map((view) => view.id);
  for (const view of ["front", "right-profile", "left-profile", "rear", "top", "plan", "silhouette", "nacelle-detail", "nose-detail", "tail-detail", "core-detail", "high-three-quarter-cutaway", "flap-detail", "flap-detail-flaps-down", "high-three-quarter-flaps-down", "right-profile-flaps-down"]) {
    assert.ok(ids.includes(view), view);
  }
  const partIds = dc3BlockoutObject.parts.map((part) => part.id);
  assert.equal(new Set(partIds).size, partIds.length);
  for (const part of dc3BlockoutObject.parts) {
    if (part.kind !== "mesh") continue;
    assert.ok(part.vertices.length >= 4, part.id);
    assert.ok(part.triangles.length >= 2, part.id);
    assert.ok(part.vertices.every((vertex) => vertex.every(Number.isFinite)), part.id);
  }
});

function rotateAround(point, pivot, axis, degrees) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const relative = subtract(point, pivot);
  const axisLength = length(axis);
  const unit = axis.map((value) => value / axisLength);
  const parallel = unit.map((value) => value * dot(relative, unit));
  const crossed = [
    unit[1] * relative[2] - unit[2] * relative[1],
    unit[2] * relative[0] - unit[0] * relative[2],
    unit[0] * relative[1] - unit[1] * relative[0],
  ];
  return [
    pivot[0] + relative[0] * cosine + crossed[0] * sine + parallel[0] * (1 - cosine),
    pivot[1] + relative[1] * cosine + crossed[1] * sine + parallel[1] * (1 - cosine),
    pivot[2] + relative[2] * cosine + crossed[2] * sine + parallel[2] * (1 - cosine),
  ];
}

function alongBand(parts, x, tolerance = 0.28) {
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const points = parts.flatMap(partPoints).filter((point) => Math.abs(point[0] - x) < tolerance);
  assert.ok(points.length > 6, `empty chord band at x=${x}`);
  const stations = points.map((point) => dot(subtract(point, origin), unit));
  return { min: Math.min(...stations), max: Math.max(...stations) };
}

test("control surfaces are cut openings with typed hinges, not painted seams", () => {
  const hinges = dc3BlockoutObject.surfaceHinges;
  const expected = [
    "flap-left-inner", "flap-left-outer", "flap-right-inner", "flap-right-outer",
    "aileron-left", "aileron-right", "elevator-left", "elevator-right", "rudder",
  ];
  assert.deepEqual(Object.keys(hinges).sort(), [...expected].sort());
  for (const id of expected) {
    const hinge = hinges[id];
    const parts = dc3BlockoutObject.parts.filter((part) => part.group === hinge.group);
    assert.ok(parts.length >= 1, id);
    assert.equal(hinge.restDegrees, 0, id);
    assert.ok(hinge.range.minDegrees < hinge.range.maxDegrees, id);
    assert.equal(hinge.pivot.length, 3, id);
    assert.ok(length(hinge.axis) > 0.5, `${id} axis`);
    assert.ok(!/rib/.test(id));
  }
  const wingVsFlap = alongBand(wings, 4.2);
  const flap = alongBand(
    dc3BlockoutObject.parts.filter((part) => part.group === "flap-right-inner"),
    4.2,
  );
  const flapGap = wingVsFlap.min - flap.max;
  assert.ok(flapGap > 0.015, `inner flap bay is still solid (${flapGap})`);
  assert.ok(flapGap < 0.14, `inner flap bay is a canyon (${flapGap})`);
  const wingVsAileron = alongBand(wings, 10.2);
  const aileron = alongBand(
    dc3BlockoutObject.parts.filter((part) => part.group === "aileron-right"),
    10.2,
  );
  const aileronGap = wingVsAileron.min - aileron.max;
  assert.ok(aileronGap > 0.015 && aileronGap < 0.14, `aileron bay ${aileronGap}`);
  const empennage = dc3BlockoutObject.parts.filter((part) => part.group === "empennage");
  const elevator = dc3BlockoutObject.parts.filter((part) => part.group === "elevator-right");
  const elevGap = alongBand(empennage, 2.1).min - alongBand(elevator, 2.1).max;
  assert.ok(elevGap > 0.01 && elevGap < 0.16, `elevator bay ${elevGap}`);
  const axis = subtract(dc3BlockoutObject.anchors.nose, dc3BlockoutObject.anchors.tail);
  const unit = axis.map((value) => value / length(axis));
  const origin = dc3BlockoutObject.anchors.tail;
  const bodyUp = [0, unit[2], -unit[1]];
  const upLen = length(bodyUp);
  const heightBand = (parts, from, to) => {
    const points = parts.flatMap(partPoints).filter((point) => {
      const height = dot(subtract(point, origin), bodyUp) / upLen;
      return height >= from && height <= to;
    });
    assert.ok(points.length > 4, `empty fin band ${from}-${to}`);
    const stations = points.map((point) => dot(subtract(point, origin), unit));
    return { min: Math.min(...stations), max: Math.max(...stations) };
  };
  const fin = dc3BlockoutObject.parts.filter((part) => part.id === "vertical-fin");
  const rudder = dc3BlockoutObject.parts.filter((part) => part.group === "rudder");
  const rudderGap = heightBand(fin, 2.6, 3.2).min - heightBand(rudder, 2.6, 3.2).max;
  assert.ok(rudderGap > 0.01 && rudderGap < 0.16, `rudder bay ${rudderGap}`);
  assert.ok(!dc3BlockoutObject.parts.some((part) => /window|door|livery/.test(part.id)));
});

test("flaps-down is a posed second state of the same leaves", () => {
  const views = dc3BlockoutObject.views;
  const down = dc3BlockoutObject.dimensions.flapDownDegrees;
  assert.ok(down < -20);
  for (const id of ["right-profile", "high-three-quarter", "flap-detail"]) {
    const rest = views.find((view) => view.id === id);
    const posed = views.find((view) => view.id === `${id}-flaps-down`);
    assert.ok(rest && posed, id);
    assert.deepEqual(posed.position, rest.position);
    assert.deepEqual(posed.target, rest.target);
    assert.equal(posed.projection, rest.projection);
    assert.equal(posed.orthoHeight ?? posed.fov, rest.orthoHeight ?? rest.fov);
    assert.equal(rest.articulation, undefined);
    for (const [group, degrees] of Object.entries(posed.articulation)) {
      assert.equal(degrees, down, group);
      assert.ok(group.startsWith("flap-"));
    }
    assert.equal(Object.keys(posed.articulation).length, 4);
  }
  const hinge = dc3BlockoutObject.surfaceHinges["flap-right-inner"];
  const flap = dc3BlockoutObject.parts.find((part) => part.id === "flap-right-inner");
  const restY = Math.min(...flap.vertices.map((vertex) => vertex[1]));
  const posed = flap.vertices.map((vertex) => (
    rotateAround(vertex, hinge.pivot, hinge.axis, hinge.range.minDegrees)
  ));
  const posedY = Math.min(...posed.map((vertex) => vertex[1]));
  assert.ok(posedY < restY - 0.25, `flap did not drop (${restY} → ${posedY})`);
  const fuselageBox = bounds(fuselage);
  for (const vertex of posed) {
    const inside = vertex[0] > fuselageBox.minX + 0.08
      && vertex[0] < fuselageBox.maxX - 0.08
      && vertex[1] > fuselageBox.minY + 0.08
      && vertex[1] < fuselageBox.maxY - 0.08
      && vertex[2] > fuselageBox.minZ + 0.08
      && vertex[2] < fuselageBox.maxZ - 0.08;
    assert.ok(!inside, "flap sweep enters the fuselage");
  }
});
