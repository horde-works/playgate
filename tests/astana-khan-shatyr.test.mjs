// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  ETFE_MEMBRANE_ENV_MAP_INTENSITY,
  ETFE_MEMBRANE_ROUGHNESS,
  pieceMaterialBaseColor,
  pieceMaterialHasEmissiveGlow,
  pieceMaterialIsTransparent,
  pieceMaterialOpacity,
} from "../games/make-a-mess/src/game/materialTextures.ts";
import {
  KHAN_SHATYR_ANCHOR_HEIGHT,
  KHAN_SHATYR_ATRIUM_LIGHTS,
  KHAN_SHATYR_ATRIUM_LIGHT_COLOR,
  KHAN_SHATYR_BASE_SEMI_AXES,
  KHAN_SHATYR_CABLE_BASE_SEMI_AXES,
  KHAN_SHATYR_CENTRE,
  KHAN_SHATYR_COLLAR_RINGS,
  KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES,
  KHAN_SHATYR_CUSHION_MAX_LENGTH,
  KHAN_SHATYR_HEIGHT,
  KHAN_SHATYR_HOOPS,
  KHAN_SHATYR_HUB_OFFSET,
  KHAN_SHATYR_LIGHTS,
  KHAN_SHATYR_LIGHT_GROUP,
  KHAN_SHATYR_MAST_LEAN_DEGREES,
  KHAN_SHATYR_MEMBRANE_COLUMNS,
  KHAN_SHATYR_MEMBRANE_FACETS,
  KHAN_SHATYR_NECK_LIGHTS,
  KHAN_SHATYR_NECK_LIGHT_COLOR,
  KHAN_SHATYR_RADIALS,
  KHAN_SHATYR_RADIAL_SAMPLE_RATIO,
  KHAN_SHATYR_REAL_RADIAL_CABLES,
  KHAN_SHATYR_RING_HEIGHT,
  KHAN_SHATYR_RING_OFFSET,
  KHAN_SHATYR_RING_RADIUS,
  KHAN_SHATYR_SCALE,
  KHAN_SHATYR_STRING_COLUMNS,
  KHAN_SHATYR_STRING_COLOR,
  KHAN_SHATYR_TOP_STRUTS,
  KHAN_SHATYR_TRIPOD_CHORDS,
  KHAN_SHATYR_TRIPOD_LEGS,
  KHAN_SHATYR_YAW,
  createKhanCableTopology,
  createKhanTripodTopology,
  khanShatyrArcParameter,
  khanShatyrLocalToWorld,
  khanShatyrStringPoint,
  khanShatyrSurfaceNormal,
  khanShatyrSurfacePoint,
} from "../games/make-a-mess/src/content/scenes/astana/astanaKhanShatyr.ts";

const khan = astanaScene.breakablePieces.filter((piece) => piece.id.includes(":khan:"));
const withPart = (part) => khan.filter((piece) => piece.id.includes(part));

const renderedYAxis = (rotation) => {
  const [rx, ry, rz] = rotation;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);
  return [
    -cy * sz,
    cx * cz - sx * sy * sz,
    sx * cz + cx * sy * sz,
  ];
};

const cylinderEnds = (piece) => {
  const axis = renderedYAxis(piece.rotation);
  return [-1, 1].map((sign) => piece.position.map((value, dimension) =>
    value + sign * axis[dimension] * piece.size[1] / 2));
};

const distance = (a, b) => Math.hypot(
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
);

const interpolate = (a, b, fraction) => a.map((value, dimension) =>
  value + (b[dimension] - value) * fraction);

const dot = (a, b) => a.reduce((sum, value, dimension) =>
  sum + value * b[dimension], 0);

const signedSkinClearance = (point, theta, arcFraction) => {
  const t = khanShatyrArcParameter(theta, arcFraction);
  const skin = khanShatyrSurfacePoint(theta, t);
  return dot(
    point.map((value, dimension) => value - skin[dimension]),
    khanShatyrSurfaceNormal(theta, t),
  );
};

test("Khan Shatyr fits its reserved plot and keeps the asymmetric real proportions", () => {
  assert.equal(KHAN_SHATYR_HEIGHT, 38);
  assert.equal(KHAN_SHATYR_SCALE, 38 / 150);
  assert.ok(Math.abs(Math.hypot(...KHAN_SHATYR_CENTRE) - 167.8) < 1e-12);
  const towardBaiterek = Math.atan2(
    -KHAN_SHATYR_CENTRE[1],
    -KHAN_SHATYR_CENTRE[0],
  );
  assert.ok(Math.abs(KHAN_SHATYR_YAW - towardBaiterek) < 1e-12,
    "the entrance axis must point exactly toward Baiterek");
  assert.deepEqual(KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES,
    [100 * KHAN_SHATYR_SCALE, 97.5 * KHAN_SHATYR_SCALE]);
  assert.deepEqual(KHAN_SHATYR_CABLE_BASE_SEMI_AXES,
    [71.5 * KHAN_SHATYR_SCALE, 57.5 * KHAN_SHATYR_SCALE]);
  assert.equal(KHAN_SHATYR_BASE_SEMI_AXES, KHAN_SHATYR_CABLE_BASE_SEMI_AXES);
  assert.equal(KHAN_SHATYR_ANCHOR_HEIGHT, 20 * KHAN_SHATYR_SCALE);
  assert.equal(KHAN_SHATYR_RING_HEIGHT, 90 * KHAN_SHATYR_SCALE);
  assert.equal(KHAN_SHATYR_RING_OFFSET, 42.9 * KHAN_SHATYR_SCALE);
  assert.equal(KHAN_SHATYR_MAST_LEAN_DEGREES, 12);
  assert.ok(Math.abs(
    KHAN_SHATYR_RING_OFFSET / (KHAN_SHATYR_CABLE_BASE_SEMI_AXES[0] * 2) - 0.3,
  ) < 1e-12);
  assert.ok(KHAN_SHATYR_HUB_OFFSET < 0,
    "the peak must lean away from Baiterek, not toward the boulevard");

  assert.ok(khan.every((piece) => Math.hypot(
    piece.position[0] - KHAN_SHATYR_CENTRE[0],
    piece.position[2] - KHAN_SHATYR_CENTRE[1],
  ) < 30), "some Khan Shatyr component stayed at the old site");
  const frontLength = Math.hypot(...KHAN_SHATYR_CENTRE);
  const frontDirection = [-KHAN_SHATYR_CENTRE[0] / frontLength,
    -KHAN_SHATYR_CENTRE[1] / frontLength];
  for (const step of withPart(":entry:step:")) {
    const projection = (step.position[0] - KHAN_SHATYR_CENTRE[0]) * frontDirection[0]
      + (step.position[2] - KHAN_SHATYR_CENTRE[1]) * frontDirection[1];
    assert.ok(projection > KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0] - 0.1,
      `${step.id}: the entrance no longer opens toward Baiterek`);
  }

  const front = khanShatyrSurfacePoint(0, 1);
  const back = khanShatyrSurfacePoint(Math.PI, 1);
  const frontRing = khanShatyrSurfacePoint(0, 0);
  const backRing = khanShatyrSurfacePoint(Math.PI, 0);
  const planSpan = (from, to) => Math.hypot(from[0] - to[0], from[2] - to[2]);
  const frontSpan = planSpan(front, frontRing);
  const backSpan = planSpan(back, backRing);
  assert.ok(frontSpan / backSpan > 5,
    `front/back plan-span ratio ${frontSpan / backSpan} has lost the pulled-cone asymmetry`);
});

test("every radial is the calibrated concave curve, never a decorated straight cone", () => {
  const planFraction = (theta, wanted) => {
    const ring = khanShatyrSurfacePoint(theta, 0);
    const anchor = khanShatyrSurfacePoint(theta, 1);
    const span = Math.hypot(anchor[0] - ring[0], anchor[2] - ring[2]);
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (low + high) / 2;
      const point = khanShatyrSurfacePoint(theta, middle);
      const travelled = Math.hypot(point[0] - ring[0], point[2] - ring[2]) / span;
      if (travelled < wanted) low = middle;
      else high = middle;
    }
    return khanShatyrSurfacePoint(theta, (low + high) / 2);
  };

  for (const theta of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const ring = khanShatyrSurfacePoint(theta, 0);
    const anchor = khanShatyrSurfacePoint(theta, 1);
    const middle = planFraction(theta, 0.5);
    const chordHeight = (ring[1] + anchor[1]) / 2;
    const drop = ring[1] - anchor[1];
    const sagRatio = (chordHeight - middle[1]) / drop;
    assert.ok(sagRatio > 0.18 && sagRatio < 0.28,
      `radial ${theta} has chord sag ratio ${sagRatio}, expected the Foster-section hollow`);

    const beforeAnchor = khanShatyrSurfacePoint(theta, 0.999);
    const horizontal = Math.hypot(
      anchor[0] - beforeAnchor[0], anchor[2] - beforeAnchor[2],
    );
    const tangentAngle = Math.atan2(
      Math.abs(anchor[1] - beforeAnchor[1]), horizontal,
    ) * 180 / Math.PI;
    assert.ok(tangentAngle < 8,
      `radial ${theta} reaches the base at ${tangentAngle}°, not almost horizontally`);
  }
});

test("the tripod is three trichord legs converging at one canonical hub", () => {
  const topology = createKhanTripodTopology();
  assert.equal(topology.legs.length, KHAN_SHATYR_TRIPOD_LEGS);
  assert.equal(new Set(topology.legs.map((leg) => leg.hub)).size, 1,
    "all legs must reference the same hub object");
  for (const leg of topology.legs) {
    assert.ok(leg.sections.length >= 5);
    assert.ok(leg.sections.every((section) =>
      section.length === KHAN_SHATYR_TRIPOD_CHORDS));
    assert.equal(leg.hub, topology.hub);
  }
  assert.equal(withPart(":tripod:").length, 126);
  for (let leg = 0; leg < KHAN_SHATYR_TRIPOD_LEGS; leg += 1) {
    assert.equal(withPart(`:tripod:${leg}:hub-chord:`).length,
      KHAN_SHATYR_TRIPOD_CHORDS);
  }
});

test("twelve pinned struts join twelve exact hub and cable-ring nodes", () => {
  const topology = createKhanTripodTopology();
  assert.equal(topology.topRing.length, KHAN_SHATYR_TOP_STRUTS);
  assert.equal(topology.strutOrigins.length, KHAN_SHATYR_TOP_STRUTS);
  assert.equal(topology.struts.length, KHAN_SHATYR_TOP_STRUTS);
  assert.ok(topology.struts.every((strut, index) =>
    strut.from === topology.strutOrigins[index]));
  assert.ok(topology.struts.every((strut, index) =>
    strut.to === topology.topRing[index]));
  assert.equal(new Set(topology.struts.map((strut) => strut.to)).size,
    KHAN_SHATYR_TOP_STRUTS);
  const ringCentre = topology.topRing.reduce((sum, node) =>
    sum.map((value, dimension) => value + node[dimension] / topology.topRing.length),
  [0, 0, 0]);
  assert.ok(Math.abs(ringCentre[0] + KHAN_SHATYR_RING_OFFSET) < 1e-10);
  assert.ok(Math.abs(ringCentre[1] - KHAN_SHATYR_RING_HEIGHT) < 1e-10);
  for (const node of topology.topRing) {
    assert.ok(Math.abs(distance(node, ringCentre) - KHAN_SHATYR_RING_RADIUS) < 1e-10);
  }

  const renderedStruts = withPart(":top-strut:");
  assert.equal(renderedStruts.length, KHAN_SHATYR_TOP_STRUTS);
  for (let strut = 0; strut < renderedStruts.length; strut += 1) {
    const ends = cylinderEnds(renderedStruts[strut]);
    const ground = renderedStruts[strut].position[1]
      - (topology.struts[strut].from[1] + topology.struts[strut].to[1]) / 2;
    const expected = [topology.struts[strut].from, topology.struts[strut].to]
      .map((point) => khanShatyrLocalToWorld(point, ground));
    const miss = Math.min(
      distance(ends[0], expected[0]) + distance(ends[1], expected[1]),
      distance(ends[0], expected[1]) + distance(ends[1], expected[0]),
    );
    assert.ok(miss < 1e-7, `rendered top strut ${strut} misses its canonical nodes by ${miss} m`);
  }
  assert.equal(withPart(":collar:ring:").length,
    KHAN_SHATYR_COLLAR_RINGS * KHAN_SHATYR_TOP_STRUTS);
  for (let level = 0; level < KHAN_SHATYR_COLLAR_RINGS; level += 1) {
    assert.equal(withPart(`:collar:ring:${level}:`).length,
      KHAN_SHATYR_TOP_STRUTS,
      `collar level ${level} is not a closed twelve-segment ring`);
  }
});

test("the cable net keeps every real hoop and a regular one-in-six radial sample", () => {
  assert.equal(KHAN_SHATYR_REAL_RADIAL_CABLES, 192);
  assert.equal(KHAN_SHATYR_RADIAL_SAMPLE_RATIO, 6);
  assert.equal(KHAN_SHATYR_RADIALS, 32);
  assert.equal(KHAN_SHATYR_HOOPS, 16);
  const topology = createKhanCableTopology();
  assert.equal(topology.nodes.length, KHAN_SHATYR_HOOPS + 2);
  assert.ok(topology.nodes.every((band) => band.length === KHAN_SHATYR_RADIALS));
  const radialEdges = topology.edges.filter((edge) => edge.kind === "radial");
  const hoopEdges = topology.edges.filter((edge) => edge.kind === "hoop");
  assert.equal(radialEdges.length,
    KHAN_SHATYR_RADIALS * (KHAN_SHATYR_HOOPS + 1));
  assert.equal(hoopEdges.length, KHAN_SHATYR_RADIALS * KHAN_SHATYR_HOOPS);

  for (const edge of topology.edges) {
    const from = topology.nodes[edge.from[0]][edge.from[1]];
    const to = topology.nodes[edge.to[0]][edge.to[1]];
    assert.equal(from.ref[0], edge.from[0]);
    assert.equal(from.ref[1], edge.from[1]);
    assert.equal(to.ref[0], edge.to[0]);
    assert.equal(to.ref[1], edge.to[1]);
    if (edge.kind === "hoop") {
      assert.equal(edge.from[0], edge.to[0]);
    } else {
      assert.equal(edge.to[0], edge.from[0] + 1);
      assert.equal(edge.from[1], edge.to[1]);
    }
  }
  assert.equal(withPart(":cable:radial:").length, radialEdges.length);
  assert.equal(KHAN_SHATYR_STRING_COLUMNS, 64);
  assert.equal(withPart(":string:radial:").length,
    (KHAN_SHATYR_STRING_COLUMNS - KHAN_SHATYR_RADIALS)
      * (KHAN_SHATYR_HOOPS + 1));
  assert.equal(withPart(":cable:hoop:").length,
    KHAN_SHATYR_STRING_COLUMNS * KHAN_SHATYR_HOOPS);

  const visibleStrings = [
    ...withPart(":cable:radial:"),
    ...withPart(":string:radial:"),
    ...withPart(":cable:hoop:"),
  ];
  assert.ok(visibleStrings.every((piece) =>
    piece.material === "steel" && piece.color === KHAN_SHATYR_STRING_COLOR),
  "all meridians and hoops must share the darker cold shadow colour");

  for (let column = 0; column < KHAN_SHATYR_STRING_COLUMNS; column += 1) {
    const theta = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
    for (let hoop = 1; hoop <= KHAN_SHATYR_HOOPS; hoop += 1) {
      const fraction = hoop / (KHAN_SHATYR_HOOPS + 1);
      const skin = khanShatyrSurfacePoint(
        theta,
        // The glass and string share an arc-length station, not a raw t.
        // Recover t explicitly to measure their normal separation.
        khanShatyrArcParameter(theta, fraction),
      );
      assert.ok(distance(khanShatyrStringPoint(theta, fraction), skin) > 0.049,
        `string/hoop node ${column}:${hoop} is buried in the ETFE`);
    }
  }

  // Node clearance alone is insufficient: a straight cylinder between two
  // valid nodes can still chord through a curved membrane. Sample every
  // rendered meridian and hoop span in surface-normal space. The thresholds
  // include the 0.032 m ETFE outer face plus each cable's own radius.
  const spanSamples = Array.from({ length: 21 }, (_, index) => index / 20);
  for (let column = 0; column < KHAN_SHATYR_STRING_COLUMNS; column += 1) {
    const theta = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
    for (let band = 0; band <= KHAN_SHATYR_HOOPS; band += 1) {
      const fromFraction = band / (KHAN_SHATYR_HOOPS + 1);
      const toFraction = (band + 1) / (KHAN_SHATYR_HOOPS + 1);
      const from = khanShatyrStringPoint(theta, fromFraction);
      const to = khanShatyrStringPoint(theta, toFraction);
      for (const sample of spanSamples) {
        const fraction = fromFraction + (toFraction - fromFraction) * sample;
        const clearance = signedSkinClearance(
          interpolate(from, to, sample), theta, fraction,
        );
        assert.ok(clearance > 0.049,
          `meridian ${column}:${band}@${sample} enters ETFE (${clearance} m)`);
      }
    }
  }
  for (let hoop = 1; hoop <= KHAN_SHATYR_HOOPS; hoop += 1) {
    const fraction = hoop / (KHAN_SHATYR_HOOPS + 1);
    for (let column = 0; column < KHAN_SHATYR_STRING_COLUMNS; column += 1) {
      const theta0 = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
      const theta1 = (column + 1) / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
      const from = khanShatyrStringPoint(theta0, fraction);
      const to = khanShatyrStringPoint(theta1, fraction);
      for (const sample of spanSamples) {
        const theta = theta0 + (theta1 - theta0) * sample;
        const clearance = signedSkinClearance(
          interpolate(from, to, sample), theta, fraction,
        );
        assert.ok(clearance > 0.046,
          `hoop ${hoop}:${column}@${sample} enters ETFE (${clearance} m)`);
      }
    }
  }

  // The visible radial and hoop drawings use one shared node function. Check
  // every secondary string endpoint rather than trusting their appearance.
  for (const piece of withPart(":string:radial:")) {
    const match = piece.id.match(/:khan:string:radial:(\d+):(\d+):piece$/);
    assert.ok(match, `unparseable string id ${piece.id}`);
    const column = Number(match[1]);
    const band = Number(match[2]);
    const theta = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
    const localEnds = [band, band + 1].map((index) =>
      khanShatyrStringPoint(theta, index / (KHAN_SHATYR_HOOPS + 1)));
    const ground = piece.position[1]
      - (localEnds[0][1] + localEnds[1][1]) / 2;
    const expected = localEnds.map((point) =>
      khanShatyrLocalToWorld(point, ground));
    const ends = cylinderEnds(piece);
    const miss = Math.min(
      distance(ends[0], expected[0]) + distance(ends[1], expected[1]),
      distance(ends[0], expected[1]) + distance(ends[1], expected[0]),
    );
    assert.ok(miss < 1e-7, `${piece.id} misses its shared string nodes by ${miss} m`);
  }

  // Hoop stations are measured along each actual curve. A long and a short
  // radial therefore cannot share one arbitrary global easing parameter.
  const longParameters = topology.nodes.map((band) => band[0].t);
  const shortParameters = topology.nodes.map((band) =>
    band[KHAN_SHATYR_RADIALS / 2].t);
  assert.ok(longParameters.some((value, band) =>
    Math.abs(value - shortParameters[band]) > 0.01));
  for (let radial = 0; radial < KHAN_SHATYR_RADIALS; radial += 1) {
    const steps = topology.nodes.slice(1).map((band, index) =>
      distance(topology.nodes[index][radial].position, band[radial].position));
    assert.ok(Math.max(...steps) / Math.min(...steps) < 1.12,
      `radial ${radial} hoop rhythm is not arc-length based`);
  }
});

test("the ETFE skin is matte and the podium approach has no false glass portal", () => {
  const cushions = withPart(":etfe:");
  assert.equal(KHAN_SHATYR_MEMBRANE_COLUMNS, 64);
  assert.equal(KHAN_SHATYR_MEMBRANE_FACETS, 2);
  assert.ok(cushions.length >= KHAN_SHATYR_MEMBRANE_COLUMNS * 6);
  assert.ok(cushions.every((piece) =>
    piece.material === "glass" && piece.shape === "panel"));
  assert.ok(cushions.every((piece) => piece.size[2] <= 0.03));
  assert.ok(cushions.every((piece) => piece.position[1] > KHAN_SHATYR_ANCHOR_HEIGHT));
  assert.ok(cushions.every((piece) => piece.size[1] <= KHAN_SHATYR_CUSHION_MAX_LENGTH / 2 + 0.1));
  for (const color of ["#eaf0f7", "#e5edf6", "#e1eaf4"]) {
    assert.equal(pieceMaterialOpacity("glass", color), 0.9,
      "ETFE must transmit light across panels without becoming window glass");
    assert.equal(pieceMaterialIsTransparent("glass", color), true);
    assert.equal(pieceMaterialHasEmissiveGlow("glass", color), false,
      "ETFE must receive local light instead of emitting its own");
    assert.equal(pieceMaterialBaseColor("glass", color), color,
      "ETFE needs its own optical batch instead of ordinary window glass");
  }
  assert.ok(ETFE_MEMBRANE_ROUGHNESS >= 0.8);
  assert.ok(ETFE_MEMBRANE_ENV_MAP_INTENSITY <= 0.35);
  assert.equal(pieceMaterialIsTransparent("glass", "#a9c9d4"), true,
    "ordinary entrance glass must remain transparent");

  assert.equal(withPart(":entry:step:").length, 6);
  assert.equal(withPart(":entry:door:").length, 0);
  assert.equal(withPart(":entry:portal-").length, 0);
  assert.equal(withPart(":entry:mullion:").length, 0);
});

test("Khan Shatyr uses local warm fixtures and never emissive ETFE", () => {
  const lamps = astanaScene.lampDefinitions.filter((lamp) => lamp.id.includes(":khan:"));
  assert.equal(lamps.length, KHAN_SHATYR_LIGHTS);
  const atrium = lamps.filter((lamp) => lamp.id.includes(":atrium:"));
  const neck = lamps.filter((lamp) => lamp.id.includes(":neck:"));
  assert.equal(atrium.length, KHAN_SHATYR_ATRIUM_LIGHTS);
  assert.equal(neck.length, KHAN_SHATYR_NECK_LIGHTS);
  assert.ok(atrium.every((lamp) =>
    lamp.color === KHAN_SHATYR_ATRIUM_LIGHT_COLOR
      && lamp.distance === 36
      && lamp.intensity >= 13));
  assert.ok(neck.every((lamp) =>
    lamp.color === KHAN_SHATYR_NECK_LIGHT_COLOR
      && lamp.distance === 32
      && lamp.intensity >= 18));
  assert.ok(lamps.every((lamp) =>
    lamp.poolGroupId === KHAN_SHATYR_LIGHT_GROUP
      && lamp.poolPriority >= 32
      && lamp.dayIntensityFactor === 0));
  const baffles = withPart(":lighting:hidden-baffle:");
  assert.equal(baffles.length, KHAN_SHATYR_LIGHTS);
  assert.ok(baffles.every((piece) =>
    piece.material === "steel" && piece.shape === "steelSheet"));
  assert.equal(withPart(":lighting:exterior").length, 0);
});

test("the complete landmark stays within its explicit scene budget", () => {
  assert.ok(khan.length >= 3000, `Khan Shatyr is under-modelled at ${khan.length} pieces`);
  assert.ok(khan.length <= 3300, `Khan Shatyr exceeds its 3300-piece budget: ${khan.length}`);
});
