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
  near(Math.max(...along) - Math.min(...along), published("envelope.length"), 0.22, "length");
  // Published tail-down height is the fin (16 ft 11 in), not the pitched-cabin AABB.
  // Restoring the oleo steepens the sit, so the cabin roof can sit above the fin;
  // burying the knuckle to keep all.maxY on that number is D36.
  const fin = dc3BlockoutObject.parts.filter((part) => part.id === "vertical-fin");
  near(
    bounds(fin).maxY - Math.min(0, all.minY),
    published("envelope.heightTailDown"),
    0.28,
    "height",
  );
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

test("the wing is a low-wing and the shafts sit on its chord", () => {
  const { worldToBody, fuselage } = dc3AirframeSurface;
  const keel = fuselage.at(0).keel;
  const rootSkin = wings.flatMap((part) =>
    part.kind === "mesh" ? part.vertices : []).map(worldToBody)
    .filter((vertex) => Math.abs(vertex[0]) < 0.45 && vertex[2] > -2.4 && vertex[2] < 1.1);
  assert.ok(rootSkin.length >= 8, "no root wing skin to compare with the keel");
  const lowest = Math.min(...rootSkin.map((vertex) => vertex[1]));
  near(lowest, keel, 0.06, "root lower surface vs keel");
  const hub = worldToBody(dc3BlockoutObject.anchors.rightProp);
  near(hub[1], dc3AirframeSurface.wing.at(hub[0]).y0, 0.03, "prop hub vs wing chord");
  assert.ok(
    bounds(props).minY > 0.15,
    `propellers at y=${bounds(props).minY.toFixed(3)} strike the ground`,
  );
});

test("the main oleo hangs below the cowl, knuckle included", () => {
  const { worldToBody } = dc3AirframeSurface;
  const pitch = dc3BlockoutObject.dimensions.threePointPitchDegrees;
  assert.ok(
    pitch > 12 && pitch < 16,
    `sit pitch ${pitch.toFixed(2)}° is not the steeper three-point after the long oleo`,
  );
  for (const side of ["left", "right"]) {
    const strut = dc3BlockoutObject.parts.find((part) => part.id === `gear-${side}-strut`);
    const wheel = dc3BlockoutObject.parts.find((part) => part.id === `gear-${side}-wheel`);
    const knuckle = dc3BlockoutObject.parts.find((part) => part.id === `gear-${side}-trunnion`);
    assert.equal(strut?.kind, "cylinder", `${side} strut`);
    assert.equal(wheel?.kind, "cylinder", `${side} wheel`);
    assert.equal(knuckle?.kind, "mesh", `${side} knuckle`);
    const hub = worldToBody(dc3BlockoutObject.anchors[side === "left" ? "leftProp" : "rightProp"]);
    const cowlBottom = hub[1] - 0.68;
    const axle = worldToBody([
      (wheel.from[0] + wheel.to[0]) / 2,
      (wheel.from[1] + wheel.to[1]) / 2,
      (wheel.from[2] + wheel.to[2]) / 2,
    ]);
    const exposed = cowlBottom - axle[1];
    assert.ok(
      exposed > 0.75,
      `${side} oleo below the cowl is ${exposed.toFixed(2)} m — knuckle still in the nacelle`,
    );
    const trunnion = worldToBody(strut.from);
    assert.ok(
      trunnion[1] < cowlBottom - 0.08,
      `${side} strut starts ${((trunnion[1] - cowlBottom) * 1000).toFixed(0)} mm inside the cowl`,
    );
    const knuckleTop = Math.max(...knuckle.vertices.map((vertex) => worldToBody(vertex)[1]));
    assert.ok(
      knuckleTop <= cowlBottom + 0.02,
      `${side} knuckle still sits ${(knuckleTop - cowlBottom).toFixed(3)} m inside the cowl`,
    );
  }
});

test("the nose holds a cabin roof, then a blunt windshield drop, with no hanging chin", () => {
  const { stations } = dc3AirframeSurface.fuselage;
  const at = (z) => stations.find((station) => Math.abs(station.z - z) < 0.05);
  const cabin = at(4.3);
  const hold = at(5.15);
  const brow = at(6.15);
  const deck = at(6.5);
  const bullet = at(6.85);
  const tip = stations.reduce((front, station) => (station.z > front.z ? station : front));
  const capMid = stations.find((station) => station.z > 7.05 && station.z < tip.z - 0.02);
  assert.ok(cabin && hold && brow && deck && bullet && capMid, "cabin / hold / brow / deck / bullet / cap missing");
  const noseToCabin = stations.filter((station) => station.z >= 4.3);
  for (const station of noseToCabin) {
    assert.equal(
      station.faceForward,
      undefined,
      `faceForward at z=${station.z} shears a fake rake`,
    );
    const power = station.upperPower ?? 2;
    assert.ok(
      power >= 2 && power <= 3.05,
      `upperPower ${power} at z=${station.z} is a box or a pinch`,
    );
  }
  const cabinPower = cabin.upperPower ?? 2;
  const tipPower = tip.upperPower ?? 2;
  assert.equal(cabinPower, 2, "passenger cabin section left the oval");
  assert.equal(tipPower, 2, "cap tip is no longer a round bullet");
  assert.ok((brow.upperPower ?? 2) >= 2.7, "brow is still a round vault over the glass");
  assert.ok((deck.upperPower ?? 2) >= 2.7, "anti-glare deck is still an oval");
  assert.ok((bullet.upperPower ?? 2) >= 2.7, "cap lip is still a round vault under the glass");
  const ovalAt = (station, angle) => {
    const { pointAt } = dc3AirframeSurface.fuselage;
    return pointAt({ ...station, upperPower: 2 }, angle)[1];
  };
  const cheek = Math.PI / 2 - 0.6;
  for (const station of [brow, deck, bullet]) {
    const y = dc3AirframeSurface.fuselage.pointAt(station, cheek)[1];
    const oval = ovalAt(station, cheek);
    assert.ok(
      y > oval + 0.03,
      `z=${station.z}: upper cheek ${y.toFixed(3)} is still the oval ${oval.toFixed(3)}`,
    );
  }
  const cabinCheek = dc3AirframeSurface.fuselage.pointAt(cabin, cheek)[1];
  assert.ok(
    Math.abs(cabinCheek - ovalAt(cabin, cheek)) < 0.005,
    "passenger cabin upper half was flattened",
  );
  const keelAngle = -Math.PI / 4;
  const browKeel = dc3AirframeSurface.fuselage.pointAt(brow, keelAngle)[1];
  assert.ok(
    Math.abs(browKeel - ovalAt(brow, keelAngle)) < 0.005,
    "keel was flattened with the greenhouse",
  );
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
  const roof = stations.filter((station) => station.z >= 4.3 && station.z <= 5.2);
  assert.ok(
    roof.every((station) => station.crown >= cabin.crown - 0.04),
    "cockpit roof droops before the windshield — that is a 21st-century fairing",
  );
  const lastRoof = at(5.8);
  assert.ok(
    lastRoof.crown < cabin.crown - 0.08,
    `last roof ${lastRoof.crown} still holds full height into the glass`,
  );
  const linearHw = (z) =>
    hold.halfWidth + (deck.halfWidth - hold.halfWidth) * ((z - hold.z) / (deck.z - hold.z));
  assert.ok(
    lastRoof.halfWidth <= linearHw(lastRoof.z) + 0.01,
    `greenhouse beam ${lastRoof.halfWidth} at z=${lastRoof.z} thickens the cabin-to-nose taper`,
  );
  assert.ok(
    brow.halfWidth <= linearHw(brow.z) + 0.01,
    `greenhouse beam ${brow.halfWidth} at z=${brow.z} thickens the cabin-to-nose taper`,
  );
  const glassHead = Math.max(
    ...dc3AirframeSurface.windshields.flatMap((pane) => [pane.corners[2][1], pane.corners[3][1]]),
  );
  assert.ok(
    brow.crown > glassHead + 0.14 && brow.crown < glassHead + 0.32,
    `brow ${brow.crown} still undercuts the glass V (${glassHead.toFixed(3)})`,
  );
  const fillet = lastRoof.crown - brow.crown;
  assert.ok(fillet >= 0.04 && fillet <= 0.22, `brow fillet ${fillet} m is a knife or a fairing`);
  const browFairing = dc3AirframeSurface.greenhouseBrow;
  assert.ok(
    Math.abs(browFairing.apex[2] - lastRoof.z) < 1e-9
      && Math.abs(browFairing.apex[0]) < 0.05,
    "brow fairing apex is not on the last roof ring",
  );
  assert.ok(
    browFairing.apex[1] > glassHead + 0.12,
    `brow fairing apex ${browFairing.apex[1].toFixed(3)} does not sit on the raised slope`,
  );
  const forehead = dc3AirframeSurface.greenhouseForehead;
  assert.ok(
    Math.abs(forehead.visorAft[0][1] - forehead.visorFore[0][1]) < 0.002
      && Math.abs(forehead.visorAft[1][1] - forehead.visorFore[1][1]) < 0.002,
    "visor is not a level cap on the windshield heads",
  );
  assert.ok(
    forehead.visorAft[1][1] < lastRoof.crown - 0.12,
    "visor already is the roof ring — the rounded close has no run",
  );
  assert.ok(
    forehead.visorFore[2][2] > forehead.visorAft[2][2],
    "visor fore edge is not the windshield heads",
  );
  const sillFairing = dc3AirframeSurface.greenhouseSill;
  assert.ok(
    Math.abs(sillFairing.apex[2] - bullet.z) < 1e-9
      && Math.abs(sillFairing.apex[0]) < 0.05,
    "sill fairing apex is not on the first cap ring",
  );
  const glassSill = Math.min(
    ...dc3AirframeSurface.windshields.flatMap((pane) => [pane.corners[0][1], pane.corners[1][1]]),
  );
  assert.ok(
    Math.abs(sillFairing.apex[1] - glassSill) < 0.08,
    `sill fairing apex ${sillFairing.apex[1].toFixed(3)} does not sit on the flattened deck (${glassSill.toFixed(3)})`,
  );
  const run = deck.z - brow.z;
  assert.ok(run > 0 && run <= 0.4, `windshield run ${run} m is not a crease`);
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
  const bulletHalfHeight = (bullet.crown - bullet.keel) / 2;
  assert.ok(
    bullet.halfWidth > bulletHalfHeight + 0.12,
    `cap lip is still a circle: hw ${bullet.halfWidth} vs ry ${bulletHalfHeight.toFixed(3)}`,
  );
  const capHalfHeight = (capMid.crown - capMid.keel) / 2;
  assert.ok(
    capMid.halfWidth > capHalfHeight + 0.12,
    `cap mid is still a circle: hw ${capMid.halfWidth} vs ry ${capHalfHeight.toFixed(3)}`,
  );
  assert.ok((capMid.upperPower ?? 2) >= 2.7, "cap mid is still a round vault");
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
  const overlay = dc3BlockoutObject.parts.find((part) => part.id === "nose-cap");
  assert.equal(overlay?.kind, "mesh", "nose overlay");
  const { worldToBody, fuselage: surface } = dc3AirframeSurface;
  const hole = surface.ring(surface.stations[0]);
  const capBody = overlay.vertices.map(worldToBody);
  for (const vertex of hole) {
    const nearest = Math.min(
      ...capBody.map((point) => Math.hypot(point[0] - vertex[0], point[1] - vertex[1], point[2] - vertex[2])),
    );
    assert.ok(
      nearest < 1e-6,
      `nose overlay misses the hole oval by ${(nearest * 1000).toFixed(1)} mm`,
    );
  }
  const tipZ = Math.max(...capBody.map((point) => point[2]));
  assert.ok(
    tipZ > surface.stations[0].z + 0.12 && tipZ < surface.stations[0].z + 0.24,
    `overlay tip at z=${tipZ.toFixed(3)} is a cone or a disk`,
  );
  const earlyZ = surface.stations[0].z + 0.05;
  const earlyWidth = Math.max(
    ...capBody
      .filter((point) => Math.abs(point[2] - earlyZ) < 0.025)
      .map((point) => Math.abs(point[0])),
  );
  assert.ok(
    earlyWidth > 0.15 && earlyWidth < 0.26,
    `overlay start was restyled (${earlyWidth.toFixed(3)} m at +5 cm)`,
  );
  const nearTipWidth = Math.max(
    ...capBody
      .filter((point) => Math.abs(point[2] - (tipZ - 0.02)) < 0.012)
      .map((point) => Math.abs(point[0])),
  );
  assert.ok(
    nearTipWidth > 0.028,
    `overlay tip is still a needle (${nearTipWidth.toFixed(3)} m at 2 cm before the tip)`,
  );

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
  const frames = dc3BlockoutObject.parts.filter((part) => /^fuselage-frame-/.test(part.id));
  const longerons = dc3BlockoutObject.parts.filter((part) => /^longeron-/.test(part.id));
  const stringers = dc3BlockoutObject.parts.filter((part) => /^stringer-/.test(part.id));
  const formers = dc3BlockoutObject.parts.filter((part) => /^wing-former-/.test(part.id));
  assert.ok(frames.length >= 8, `only ${frames.length} fuselage frames`);
  const longeronRails = new Set(longerons.map((part) => part.id.replace(/:.*$/, "")));
  assert.equal(longeronRails.size, 4);
  assert.ok(stringers.length >= 8, `only ${stringers.length} stringers to hang the skin`);
  assert.ok(formers.length >= 15, `only ${formers.length} wing formers`);
  assert.ok(
    !frames.some((part) => /z(6\.(15|5)|5\.8)$/.test(part.id)),
    "a bulkhead still occupies the greenhouse opening",
  );
  const { worldToBody, windshields, sideLights } = dc3AirframeSurface;
  for (const pane of [...windshields, ...sideLights]) {
    const centroid = pane.corners[0].map((_, axis) =>
      pane.corners.reduce((sum, corner) => sum + corner[axis], 0) / 4);
    for (const part of dc3BlockoutObject.parts.filter((entry) => entry.group === "structure-fuselage")) {
      for (const vertex of part.vertices) {
        const body = worldToBody(vertex);
        const dx = body[0] - centroid[0];
        const dy = body[1] - centroid[1];
        const dz = body[2] - centroid[2];
        assert.ok(
          dx * dx + dy * dy + dz * dz > 0.12 ** 2,
          `${part.id} occupies ${pane.id} glass`,
        );
      }
    }
  }
  const sideAft = Math.min(...sideLights.flatMap((pane) => pane.corners.map((corner) => corner[2])));
  for (const part of [...longerons, ...stringers]) {
    for (const vertex of part.vertices) {
      const body = worldToBody(vertex);
      assert.ok(
        body[2] <= sideAft - 0.08,
        `${part.id} runs past the side-light frame (z ${body[2].toFixed(3)} > ${sideAft.toFixed(3)})`,
      );
    }
  }
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
  const { worldToBody, wing } = dc3AirframeSurface;
  const airfoilY = (x, z) => {
    const ring = wing.band(x, 0, 1);
    let yMax = -Infinity;
    let yMin = Infinity;
    for (let index = 0; index < ring.length; index += 1) {
      const here = ring[index];
      const next = ring[(index + 1) % ring.length];
      const span = next[2] - here[2];
      if (Math.abs(span) < 1e-9) continue;
      const t = (z - here[2]) / span;
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      const y = here[1] + (next[1] - here[1]) * Math.min(1, Math.max(0, t));
      yMax = Math.max(yMax, y);
      yMin = Math.min(yMin, y);
    }
    return { yMax, yMin };
  };
  for (const x of [0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 5.79]) {
    const section = wing.at(x);
    const innerThird = Math.abs(x) < wing.halfSpan / 3;
    for (const part of wingCage) {
      if (part.kind !== "mesh") continue;
      for (const vertex of part.vertices) {
        const body = worldToBody(vertex);
        if (Math.abs(Math.abs(body[0]) - x) > 0.05) continue;
        if (body[2] > section.leading + 0.02 || body[2] < section.leading - section.chord - 0.02) {
          continue;
        }
        const { yMax, yMin } = airfoilY(body[0], body[2]);
        if (!Number.isFinite(yMax)) continue;
        const half = (yMax - yMin) / 2;
        const margin = innerThird
          ? Math.min(0.05, Math.max(0.02, half * 0.32))
          : Math.min(0.04, Math.max(0.012, half * 0.25));
        assert.ok(
          body[1] < yMax - margin,
          `${part.id} pokes the upper skin at x=${x} by ${((body[1] - yMax) * 1000).toFixed(0)} mm`,
        );
        assert.ok(
          body[1] > yMin + margin,
          `${part.id} pokes the lower skin at x=${x} by ${((yMin - body[1]) * 1000).toFixed(0)} mm`,
        );
      }
    }
  }
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
  const skins = ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage", "nose-cap"];
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
  for (const view of ["front", "right-profile", "left-profile", "rear", "top", "plan", "silhouette", "nacelle-detail", "nose-detail", "cockpit-cutaway", "tail-detail", "core-detail", "high-three-quarter-cutaway", "flap-detail", "flap-detail-flaps-down", "high-three-quarter-flaps-down", "right-profile-flaps-down"]) {
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

test("wing and stabilizer tips round the box to the rectangular leaves", () => {
  const { wing, stabiliser } = dc3AirframeSurface;
  const linearTE = (x, half, rootChord, tipChord, rootLE, tipLE) => {
    const spanT = Math.min(1, Math.abs(x) / half);
    const chord0 = rootChord * (1 - spanT) + tipChord * spanT;
    const leading0 = rootLE * (1 - spanT) + tipLE * spanT;
    return leading0 - chord0;
  };
  const aileronOut = wing.aileronSpan.outer;
  const aileronMid = (wing.aileronSpan.inner + aileronOut) / 2;
  const aileronTE = (x) => {
    const section = wing.at(x);
    return section.leading - section.chord;
  };
  const wingLinearTE = (x) => linearTE(x, wing.halfSpan, 4.42, 1.56, 1.18, 0.22);
  assert.ok(
    Math.abs(aileronTE(aileronOut) - wingLinearTE(aileronOut)) < 0.02,
    `aileron outer TE follows the tip ellipse, not the rectangular inset`,
  );
  assert.ok(
    Math.abs(aileronTE(aileronMid) - wingLinearTE(aileronMid)) < 0.02,
    `aileron mid TE is pinched — the leaf was rounded with the box`,
  );
  const cap = wing.at(wing.halfSpan - 0.04);
  assert.ok(
    cap.te > wingLinearTE(wing.halfSpan - 0.04) + 0.08,
    `wingtip TE stays square outboard of the aileron (${(cap.te - wingLinearTE(wing.halfSpan - 0.04)).toFixed(2)} m)`,
  );
  const tip = wing.at(wing.halfSpan - 0.04);
  const before = wing.at(wing.halfSpan - wing.tipRound - 0.05);
  const tipLinearLE = (() => {
    const spanT = (wing.halfSpan - 0.04) / wing.halfSpan;
    return 1.18 * (1 - spanT) + 0.22 * spanT;
  })();
  assert.ok(
    tip.leading < tipLinearLE - 0.25,
    `wing LE is not rounded back to the aileron (${(tipLinearLE - tip.leading).toFixed(2)} m)`,
  );
  assert.ok(
    before.leading > tip.leading + 0.2,
    "wingtip round does not pull the LE aft toward the hinge",
  );
  const aileronX = Math.max(
    ...dc3BlockoutObject.parts.filter((part) => part.group === "aileron-right")
      .flatMap(partPoints).map((point) => point[0]),
  );
  const wingX = bounds(wings).maxX;
  assert.ok(
    wingX - aileronX > 0.4 && wingX - aileronX < 0.7,
    `aileron runs to the tip instead of leaving a rounded cap (${((wingX - aileronX) * 1000).toFixed(0)} mm)`,
  );
  const elevOut = stabiliser.elevatorSpan.outer;
  const elevMid = (stabiliser.elevatorSpan.inner + elevOut) / 2;
  const elevTE = (x) => {
    const section = stabiliser.section(x);
    return section.leading - section.chord;
  };
  const stabLinearTE = (x) => linearTE(x, stabiliser.halfSpan, 1.82, 1.02, -10.15, -10.5);
  assert.ok(
    Math.abs(elevTE(elevOut) - stabLinearTE(elevOut)) < 0.02,
    "elevator outer TE follows the tip ellipse, not the rectangular inset",
  );
  assert.ok(
    Math.abs(elevTE(elevMid) - stabLinearTE(elevMid)) < 0.02,
    "elevator mid TE is pinched — the leaf was rounded with the box",
  );
  const elevatorX = Math.max(
    ...dc3BlockoutObject.parts.filter((part) => part.group === "elevator-right")
      .flatMap(partPoints).map((point) => point[0]),
  );
  assert.ok(
    stabiliser.halfSpan - elevatorX < 0.08,
    "elevator stopped short of the rounded stabilizer tip",
  );
});

test("the wingtip pinches to a rounded edge, not a sliced airfoil", () => {
  const { wing, worldToBody } = dc3AirframeSurface;
  const sectionHeight = (x) => {
    const ring = wing.band(x, 0, 1);
    return Math.max(...ring.map((point) => point[1]))
      - Math.min(...ring.map((point) => point[1]));
  };
  const atAileron = sectionHeight(wing.aileronSpan.outer);
  const nearTip = sectionHeight(wing.halfSpan - 0.04);
  const atTip = sectionHeight(wing.halfSpan);
  assert.ok(
    nearTip < atAileron * 0.5,
    `cap at 4 cm still has airfoil height ${nearTip.toFixed(3)} m against ${atAileron.toFixed(3)} m at the aileron`,
  );
  assert.ok(
    atTip < 0.02,
    `tip section is still ${atTip.toFixed(3)} m thick`,
  );
  const right = dc3BlockoutObject.parts.find((part) => part.id === "wing-right");
  assert.equal(right?.kind, "mesh");
  const outboard = right.vertices
    .map(worldToBody)
    .filter((vertex) => vertex[0] > wing.halfSpan - 0.03);
  assert.ok(outboard.length >= 3, "no outboard wing skin to pinch");
  const height = Math.max(...outboard.map((vertex) => vertex[1]))
    - Math.min(...outboard.map((vertex) => vertex[1]));
  assert.ok(
    height < 0.05,
    `outboard 3 cm still reads as a sliced profile (${height.toFixed(3)} m)`,
  );
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
