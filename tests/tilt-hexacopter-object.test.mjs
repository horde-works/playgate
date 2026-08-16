import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  TILT_HEX_BELT_BEAM_Z,
  TILT_HEX_BODY_SECTIONS,
  TILT_HEX_PART_BUDGET,
  TILT_HEX_ROTOR_OUTER_RADIUS,
  TILT_HEX_ROTOR_STATIONS,
  tiltHexacopterObject,
} from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";

const parts = tiltHexacopterObject.parts;
const contourExpectations = JSON.parse(fs.readFileSync(new URL(
  "../games/make-a-mess/docs/tilt-hexacopter/evidence/b11-contour-expectations.json",
  import.meta.url,
), "utf8"));
const withPrefix = (prefix) => parts.filter((part) => part.id.startsWith(prefix));
const meshBounds = (part) => ({
  min: [0, 1, 2].map((axis) => Math.min(...part.vertices.map((vertex) => vertex[axis]))),
  max: [0, 1, 2].map((axis) => Math.max(...part.vertices.map((vertex) => vertex[axis]))),
});
const sectionAt = (part, z, tolerance = 1e-6) => [...new Map(
  part.vertices
    .filter((vertex) => Math.abs(vertex[2] - z) < tolerance)
    .map((vertex) => [vertex.join(","), vertex]),
).values()];

test("the review model has a bounded, unique, non-degenerate emitted inventory", () => {
  assert.ok(parts.length <= TILT_HEX_PART_BUDGET, `${parts.length} parts`);
  assert.equal(new Set(parts.map(({ id }) => id)).size, parts.length);
  for (const part of parts) {
    if (part.kind !== "mesh") continue;
    assert.ok(part.vertices.length >= 4, part.id);
    assert.ok(part.triangles.length >= 2, part.id);
    for (const vertex of part.vertices) assert.ok(vertex.every(Number.isFinite), part.id);
    for (const [ia, ib, ic] of part.triangles) {
      const [a, b, c] = [part.vertices[ia], part.vertices[ib], part.vertices[ic]];
      assert.ok(a && b && c, `${part.id}: bad triangle index`);
      const ab = b.map((value, axis) => value - a[axis]);
      const ac = c.map((value, axis) => value - a[axis]);
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      assert.ok(Math.hypot(...cross) > 1e-10, `${part.id}: degenerate triangle`);
    }
  }
});

test("the requested 6+2 topology is explicit", () => {
  assert.equal(withPrefix("duct-shell-").length, 6);
  assert.equal(withPrefix("rotor-hub-").length, 6);
  assert.equal(withPrefix("hinge-pin-").length, 6);
  assert.equal(withPrefix("longitudinal-engine-shell-").length, 2);
  assert.equal(withPrefix("outer-armour-belt-").length, 2);
  assert.equal(parts.filter(({ id }) => /^belt-spar-left-\d$/.test(id)).length, 3);
  assert.equal(parts.filter(({ id }) => /^belt-spar-right-\d$/.test(id)).length, 3);
});

test("each complete lift ring owns a distinct eccentric longitudinal hinge", () => {
  const hinges = Object.values(tiltHexacopterObject.surfaceHinges);
  assert.equal(hinges.length, 6);
  assert.equal(new Set(hinges.map(({ group }) => group)).size, 6);
  for (const [index, hinge] of hinges.entries()) {
    const station = TILT_HEX_ROTOR_STATIONS[index];
    assert.deepEqual(hinge.axis, [0, 0, 1]);
    assert.equal(hinge.motion, "independent-eccentric-tilt");
    const distanceFromHub = Math.hypot(
      hinge.pivot[0] - station.center[0],
      hinge.pivot[1] - station.center[1],
      hinge.pivot[2] - station.center[2],
    );
    assert.ok(distanceFromHub > TILT_HEX_ROTOR_OUTER_RADIUS,
      `${hinge.id}: pivot passes through ring envelope`);
    assert.ok(distanceFromHub < TILT_HEX_ROTOR_OUTER_RADIUS + 0.16,
      `${hinge.id}: pivot is no longer tangent to ring`);
    assert.ok(parts.some((part) => part.group === hinge.group && part.id === `duct-shell-${station.id}`));
  }
});

test("armour load reaches the body through three paired static aerodynamic frames", () => {
  const rotorZ = TILT_HEX_ROTOR_STATIONS.map(({ center }) => center[2]);
  for (const side of ["left", "right"]) {
    for (const [index, expectedZ] of TILT_HEX_BELT_BEAM_Z.entries()) {
      const spar = parts.find(({ id }) => id === `belt-spar-${side}-${index}`);
      assert.equal(spar?.kind, "mesh");
      const box = meshBounds(spar);
      const centreZ = (box.min[2] + box.max[2]) / 2;
      assert.ok(Math.abs(centreZ - expectedZ) < 0.01, spar.id);
      assert.ok(Math.min(...rotorZ.map((z) => Math.abs(z - centreZ))) > TILT_HEX_ROTOR_OUTER_RADIUS,
        `${spar.id}: spar cuts through a rotor envelope`);
      assert.ok(box.min[0] < -0.45 || box.max[0] > 0.45, `${spar.id}: no body root`);
      assert.ok(Math.max(Math.abs(box.min[0]), Math.abs(box.max[0])) > 3.2,
        `${spar.id}: spar does not reach armour socket`);
    }
  }
  assert.equal(parts.some(({ group }) => group.startsWith("tilt-ring-") && /belt|spar|armour/.test(group)), false);
});

test("three aerodynamic spars per side rise outward as a downward-narrowing trapezoid", () => {
  for (const side of ["left", "right"]) {
    const sign = side === "left" ? -1 : 1;
    for (let index = 0; index < 3; index += 1) {
      const spar = parts.find(({ id }) => id === `belt-spar-${side}-${index}`);
      assert.equal(spar?.kind, "mesh");
      const localX = spar.vertices.map((vertex) => vertex[0] * sign);
      const innerX = Math.min(...localX);
      const outerX = Math.max(...localX);
      const inner = spar.vertices.filter((vertex) => vertex[0] * sign < innerX + 0.25);
      const outer = spar.vertices.filter((vertex) => vertex[0] * sign > outerX - 0.25);
      const averageY = (vertices) => vertices.reduce((sum, vertex) => sum + vertex[1], 0) / vertices.length;
      assert.ok(averageY(outer) > averageY(inner) + 0.25, `${spar.id}: spar no longer rises outward`);
    }
  }
});

test("the coherent B08 armoured exterior remains separate from the primary core", () => {
  const hull = parts.find(({ id }) => id === contourExpectations.hull.requiredShellPart);
  assert.equal(hull?.kind, "mesh");
  const hullBox = meshBounds(hull);
  const width = hullBox.max[0] - hullBox.min[0];
  const length = hullBox.max[2] - hullBox.min[2];
  const height = hullBox.max[1] - hullBox.min[1];
  assert.ok(width < contourExpectations.hull.maximumWidth, `hull width ${width} has become a barge again`);
  assert.ok(length >= contourExpectations.hull.minimumLength, `body length ${length} lost longitudinal dominance`);
  assert.ok(height <= contourExpectations.hull.maximumHeight,
    `hull height ${height} has returned to a deep kayak body`);
  assert.ok(length / width > contourExpectations.hull.minimumAspectRatio,
    `hull aspect ${length / width} is not fighter-like`);
  assert.ok(width / height >= contourExpectations.hull.minimumWidthToHeight,
    `hull section ${width / height} is too tall and narrow`);
  const core = parts.filter(({ group }) => group === "primary-core");
  assert.ok(core.length >= 16, `primary core collapsed to ${core.length} parts`);
  assert.equal(hull.group, "hull-shell");
  assert.ok(core.every(({ id }) => id.startsWith("primary-core-")));
  assert.equal(core.some(({ id }) => id === hull.id), false);
});

test("only the lower rear third rises around the core while the B08 nose stays fixed", () => {
  const hull = parts.find(({ id }) => id === contourExpectations.hull.requiredShellPart);
  assert.equal(hull?.kind, "mesh");
  const bellyAt = (z) => Math.min(...sectionAt(hull, z).map((vertex) => vertex[1]));
  const crownAt = (z) => Math.max(...sectionAt(hull, z).map((vertex) => vertex[1]));
  const central = contourExpectations.hull.centralBellyStations.map(bellyAt);
  assert.ok(Math.max(...central) - Math.min(...central) <= contourExpectations.hull.maximumCentralBellyRange,
    `central belly still rocks by ${Math.max(...central) - Math.min(...central)} m`);
  const rearBelly = contourExpectations.hull.rearUndercutStations.map(bellyAt);
  for (let index = 1; index < rearBelly.length; index += 1) {
    assert.ok(rearBelly[index] > rearBelly[index - 1], "rear-third undercut is not progressive");
  }
  assert.ok(rearBelly.at(-1) - rearBelly[0] >= contourExpectations.hull.minimumRearBellyRise,
    `rear-third belly rise ${rearBelly.at(-1) - rearBelly[0]} m is too soft`);
  const tail = sectionAt(hull, contourExpectations.hull.tailStation);
  assert.ok(Math.max(...tail.map((vertex) => Math.abs(vertex[0])))
    >= contourExpectations.hull.minimumTailHalfWidth, "tail shell was not widened");
  for (const station of contourExpectations.coreClearance.stations) {
    assert.ok(bellyAt(station.z) <= station.minimumCoreBottomY - contourExpectations.coreClearance.minimumSkinClearance,
      `rear undercut at z=${station.z} intrudes into the protected core envelope`);
  }
  const nose = contourExpectations.noseWedge;
  const tipDepth = crownAt(nose.tipStation) - bellyAt(nose.tipStation);
  assert.ok(nose.tipStation - nose.rootStation <= nose.maximumAxialRun,
    "nose wedge has stretched back into a kayak prow");
  assert.ok(tipDepth >= nose.minimumTipDepth,
    `nose tip depth ${tipDepth} m has collapsed into a spike`);
  assert.ok(crownAt(nose.rootStation) - crownAt(nose.tipStation) >= nose.minimumCrownDropFromRoot,
    "upper armour line no longer descends decisively from the wedge root");
  assert.ok(bellyAt(nose.tipStation) - bellyAt(nose.rootStation) >= nose.minimumTipBellyAboveRoot,
    "nose tip has dropped below the hull as a detached beak");
  const root = sectionAt(hull, nose.rootStation);
  const rootCheek = Math.max(...root.filter((vertex) => vertex[1] >= nose.rootCheekBandY[0]
    && vertex[1] <= nose.rootCheekBandY[1])
    .map((vertex) => Math.abs(vertex[0])));
  const rootShoulder = Math.max(...root.filter((vertex) => vertex[1] >= nose.rootShoulderBandY[0]
    && vertex[1] <= nose.rootShoulderBandY[1])
    .map((vertex) => Math.abs(vertex[0])));
  assert.ok(rootCheek - rootShoulder >= nose.minimumRootCheekBeyondShoulder,
    "nose root has lost the RAX-like projecting cheek and upper tumblehome");
});

test("the cabin flanks have a real cheek, upper tumblehome and longitudinal width break", () => {
  const hull = parts.find(({ id }) => id === contourExpectations.hull.requiredShellPart);
  assert.equal(hull?.kind, "mesh");
  const halfWidthInBand = (z, minY, maxY) => Math.max(...sectionAt(hull, z)
    .filter((vertex) => vertex[1] >= minY && vertex[1] <= maxY)
    .map((vertex) => Math.abs(vertex[0])));
  const station = contourExpectations.cabinFlank.tumblehomeStation;
  const cheek = halfWidthInBand(station, ...contourExpectations.cabinFlank.cheekBandY);
  const upperShoulder = halfWidthInBand(station, ...contourExpectations.cabinFlank.shoulderBandY);
  assert.ok(cheek - upperShoulder >= contourExpectations.cabinFlank.minimumMidCheekBeyondUpperShoulder,
    `cabin side has flattened: cheek ${cheek}, upper shoulder ${upperShoulder}`);
  const cheekWidths = contourExpectations.cabinFlank.longitudinalStations.map((z) => (
    halfWidthInBand(z, ...contourExpectations.cabinFlank.cheekBandY)
  ));
  assert.ok(Math.max(...cheekWidths) - Math.min(...cheekWidths)
    >= contourExpectations.cabinFlank.minimumCheekVariation,
  `cabin cheek line is still a straight slab: ${cheekWidths.join(", ")}`);
  const widestIndex = cheekWidths.indexOf(Math.max(...cheekWidths));
  assert.equal(contourExpectations.cabinFlank.longitudinalStations[widestIndex],
    contourExpectations.cabinFlank.maximumCheekStation,
    "maximum cheek width is no longer under the forward half of the canopy");
});

test("the central RAX-like tail beam is a tapered continuation of the primary core", () => {
  const spec = contourExpectations.tailBoom;
  const boom = parts.find(({ id }) => id === spec.part);
  const hull = parts.find(({ id }) => id === contourExpectations.hull.requiredShellPart);
  assert.equal(boom?.kind, "mesh");
  assert.equal(boom.group, spec.requiredGroup);
  const boomBox = meshBounds(boom);
  const hullBox = meshBounds(hull);
  assert.ok(boomBox.max[2] >= spec.rootStation, "tail boom no longer overlaps the primary cage");
  assert.ok(boomBox.min[2] <= spec.tipStation, "tail boom was shortened");
  assert.ok(hullBox.min[2] - boomBox.min[2] >= spec.minimumExtensionPastShell,
    "central tail boom does not visibly continue past the shell");
  const rootWidth = Math.max(...sectionAt(boom, spec.rootStation).map((vertex) => Math.abs(vertex[0])));
  const tipWidth = Math.max(...sectionAt(boom, spec.tipStation).map((vertex) => Math.abs(vertex[0])));
  assert.ok(rootWidth > tipWidth, "tail boom no longer tapers aft");
});

test("the armour belt has a sharp front and a substantially reinforced rear", () => {
  for (const side of ["left", "right"]) {
    const belt = parts.find(({ id }) => id === `outer-armour-belt-${side}`);
    assert.equal(belt?.kind, "mesh");
    const sign = side === "left" ? -1 : 1;
    const section = (z) => [...new Map(
      belt.vertices
        .filter((vertex) => Math.abs(vertex[2] - z) < 1e-6)
        .map((vertex) => [vertex.join(","), vertex]),
    ).values()];
    const front = section(3.85);
    const rear = section(-3.7);
    assert.equal(front.length, 4);
    assert.equal(rear.length, 4);
    const lateralThickness = (points) => {
      const xs = points.map((vertex) => vertex[0] * sign);
      return Math.max(...xs) - Math.min(...xs);
    };
    const verticalHeight = (points) => Math.max(...points.map((vertex) => vertex[1]))
      - Math.min(...points.map((vertex) => vertex[1]));
    assert.ok(lateralThickness(rear) > lateralThickness(front) * 3.5,
      `${side}: rear belt is not substantially thicker`);
    assert.ok(verticalHeight(rear) > verticalHeight(front) + 1.3,
      `${side}: rear belt is not substantially taller`);
    assert.ok(Math.max(...rear.map((vertex) => vertex[0] * sign))
      - Math.max(...front.map((vertex) => vertex[0] * sign)) > 0.75,
    `${side}: belt plan remains fore/aft symmetric`);
  }
});

test("the forward half-segment reaches beyond the front rotor diagonal", () => {
  for (const side of ["left", "right"]) {
    const belt = parts.find(({ id }) => id === `outer-armour-belt-${side}`);
    const frontTipZ = Math.max(...belt.vertices.map((vertex) => vertex[2]));
    const frontRotor = TILT_HEX_ROTOR_STATIONS.find((station) => station.id === `front-${side}`);
    assert.ok(frontTipZ > frontRotor.center[2] + TILT_HEX_ROTOR_OUTER_RADIUS + 0.75,
      `${side}: added half-segment does not protect the forward diagonal`);
  }
});

test("the canopy continues through an engine-separating hump into an upper shark tail", () => {
  const hump = parts.find(({ id }) => id === "dorsal-armour-hump");
  assert.equal(hump?.kind, "mesh");
  const box = meshBounds(hump);
  assert.ok(box.max[1] >= contourExpectations.sharkRidge.minimumAbsoluteCrown,
    "shark-tail crown is missing");
  const dorsalVertices = parts.filter(({ group }) => group === "dorsal-hump")
    .flatMap((part) => part.vertices ?? []);
  assert.ok(Math.min(...dorsalVertices.map((vertex) => vertex[2])) < -4.2
    && Math.max(...dorsalVertices.map((vertex) => vertex[2])) > 0.3,
  "canopy-to-dorsal armour run is not continuous");
  const engineShells = withPrefix("longitudinal-engine-shell-");
  assert.equal(engineShells.length, 2);
  const engineInnerGap = Math.min(...engineShells.flatMap((engine) => engine.vertices.map((vertex) => Math.abs(vertex[0]))));
  assert.ok(engineInnerGap > 0.24, `engine gap ${engineInnerGap} cannot accept the dorsal armour hump`);
  const canopyParts = contourExpectations.canopy.requiredGlazingParts.map((id) => parts.find((part) => part.id === id));
  assert.ok(canopyParts.every((part) => part?.kind === "mesh"), "stepped glazing masses are incomplete");
  const canopyVertices = canopyParts.flatMap((part) => part.vertices);
  const canopyRun = Math.max(...canopyVertices.map((vertex) => vertex[2]))
    - Math.min(...canopyVertices.map((vertex) => vertex[2]));
  assert.ok(canopyRun >= contourExpectations.canopy.minimumGlazingRun,
    `cockpit glazing run ${canopyRun} is no longer visibly elongated`);
  const flowParts = contourExpectations.canopy.dorsalFlowParts.map((id) => parts.find((part) => part.id === id));
  assert.ok(flowParts.every((part) => part?.kind === "mesh"), "nose-canopy-ridge flow is incomplete");
  const dorsalFlow = contourExpectations.canopy.dorsalFlowStations.map((z) => Math.max(
    ...flowParts.flatMap((part) => sectionAt(part, z).map((vertex) => vertex[1])),
  ));
  for (let index = 1; index < dorsalFlow.length; index += 1) {
    const rise = dorsalFlow[index] - dorsalFlow[index - 1];
    assert.ok(rise > 0, "canopy crown forms a separate bubble before the ridge");
    assert.ok(rise <= contourExpectations.canopy.maximumSingleStepRise,
      `canopy crown has an abrupt ${rise} m step`);
  }
  assert.ok(dorsalFlow.at(-1) - dorsalFlow[0] >= contourExpectations.canopy.minimumDorsalRise,
    "nose-to-ridge line is too flat to read as one rising dorsal gesture");
  const engineCrown = Math.max(...engineShells.flatMap((engine) => engine.vertices.map((vertex) => vertex[1])));
  const crownDelta = box.max[1] - engineCrown;
  assert.ok(crownDelta >= contourExpectations.sharkRidge.minimumCrownAboveEngine,
    "upper shark ridge is drowned between engine nacelles");
  assert.ok(crownDelta <= contourExpectations.sharkRidge.maximumCrownAboveEngine,
    "upper shark ridge has returned to a sail-like fin");
  const ridgeHalfWidth = Math.max(...hump.vertices.map((vertex) => Math.abs(vertex[0])));
  assert.ok(ridgeHalfWidth >= contourExpectations.sharkRidge.minimumHalfWidth,
    `shark ridge half-width ${ridgeHalfWidth} is too thin`);
  const shrouds = withPrefix("engine-armour-shroud-");
  const shroudBottom = Math.min(...shrouds.flatMap((shroud) => shroud.vertices.map((vertex) => vertex[1])));
  const rearHullCrown = Math.max(...sectionAt(parts.find(({ id }) => id === contourExpectations.hull.requiredShellPart),
    contourExpectations.engineIntegration.rearHullStation)
    .map((vertex) => vertex[1]));
  assert.ok(rearHullCrown - shroudBottom >= contourExpectations.engineIntegration.minimumVerticalBurial,
    "axial engines have climbed back onto the hull instead of seating into the rear shoulders");
});

test("the independent and side-hover states use the same six moving groups", () => {
  const movingGroups = Object.values(tiltHexacopterObject.surfaceHinges).map(({ group }) => group).sort();
  for (const id of ["independent-tilt", "side-hover"]) {
    const view = tiltHexacopterObject.views.find((candidate) => candidate.id === id);
    assert.ok(view?.articulation, id);
    assert.deepEqual(Object.keys(view.articulation).sort(), movingGroups);
  }
  const independent = tiltHexacopterObject.views.find(({ id }) => id === "independent-tilt").articulation;
  assert.ok(new Set(Object.values(independent)).size >= 3, "rings are still moving as one rigid bank");
});

test("professional projection set and paired structural views are fixed", () => {
  const ids = tiltHexacopterObject.views.map(({ id }) => id);
  for (const required of [
    "front", "rear", "left", "right", "top", "front-three-quarter",
    "rear-three-quarter", "high-three-quarter", "hinge-detail",
    "belt-load-path", "independent-tilt", "side-hover",
    "structural-exterior", "structural-cutaway", "primary-core-isometric",
    "primary-core-load-path", "dorsal-profile",
    "central-body-three-quarter", "engine-tail-profile",
  ]) assert.ok(ids.includes(required), required);
  const exterior = tiltHexacopterObject.views.find(({ id }) => id === "structural-exterior");
  const cutaway = tiltHexacopterObject.views.find(({ id }) => id === "structural-cutaway");
  assert.deepEqual(cutaway.position, exterior.position);
  assert.deepEqual(cutaway.target, exterior.target);
  assert.deepEqual(cutaway.hiddenGroups, ["hull-shell", "canopy", "dorsal-hump", "engine-armour"]);
  assert.equal(cutaway.hiddenGroups.includes("primary-core"), false);
  const isolated = tiltHexacopterObject.views.find(({ id }) => id === "primary-core-isometric");
  assert.ok(isolated.hiddenGroups.includes("hull-shell"));
  assert.ok(isolated.hiddenGroups.includes("belt-spars"));
  assert.equal(isolated.hiddenGroups.includes("primary-core"), false);
});
