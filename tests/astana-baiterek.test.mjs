// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  BAITEREK_HEIGHT,
  BAITEREK_CROWN_LIGHT_COLOR,
  BAITEREK_CROWN_LIGHTS,
  BAITEREK_SHAFT_LIGHT_COLOR,
  BAITEREK_UPLIGHTS,
  CROWN_OUTER_EDGE_ANGLE_DEGREES,
  CROWN_TRUSS_PROFILE,
  CROWN_TRUSSES,
  NEST_BRANCHES,
  SHAFT_TOP,
  SPHERE_BOTTOM,
  SPHERE_DIAMETER,
  STEMS,
  crownTrussGeometry,
  shaftRadius,
} from "../games/make-a-mess/src/content/scenes/astana/astanaBaiterek.ts";

const baiterek = astanaScene.breakablePieces.filter((piece) => piece.id.includes("baiterek:"));
const withPart = (part) => baiterek.filter((piece) => piece.id.includes(part));

test("Baiterek keeps the proportions of the original monument", () => {
  assert.equal(BAITEREK_HEIGHT, 52);
  // 22 m sphere / 105 m complete monument, preserved at island scale.
  assert.ok(
    Math.abs(SPHERE_DIAMETER / BAITEREK_HEIGHT - 22 / 105) < 0.005,
    `sphere ratio ${SPHERE_DIAMETER / BAITEREK_HEIGHT}`,
  );
  assert.ok(
    shaftRadius(0) * 2 < SPHERE_DIAMETER,
    "the structural foot must remain narrower than the golden sphere",
  );
});

test("the shaft is an hourglass with a real upper opening", () => {
  const samples = Array.from({ length: 75 }, (_, index) => {
    const y = SHAFT_TOP * index / 74;
    return { y, radius: shaftRadius(y) };
  });
  const waist = samples.reduce((best, sample) => sample.radius < best.radius ? sample : best);
  assert.ok(waist.y > 14 && waist.y < 24, `waist at ${waist.y.toFixed(1)} m`);
  assert.ok(shaftRadius(0) > waist.radius * 1.8, "lower flare is missing");
  assert.ok(shaftRadius(SHAFT_TOP) > waist.radius * 1.5, "upper cup is missing");
  assert.ok(
    shaftRadius(SHAFT_TOP) - shaftRadius(SHAFT_TOP - 1) > 0.04,
    "the profile must keep opening into the crown instead of flattening at the joint",
  );
});

test("the crown has sixteen exact edge-out tetrahedra", () => {
  assert.equal(STEMS, 8);
  assert.equal(withPart(":stem:").length, STEMS * 14);
  assert.equal(CROWN_TRUSSES, 16);
  assert.equal(withPart(":crown-arm:").length, 0, "standalone fan arms must not return");
  assert.equal(withPart(":petal-brace:").length, 0, "flat ray-like petals must not return");
  assert.equal(withPart(":branch-tip:").length, 0, "the white crown has no coloured tip markers");

  const branchMembers = baiterek.filter((piece) => /:branch:\d+:piece$/.test(piece.id));
  const trussBraces = withPart(":truss-brace:");
  const nestHoops = withPart(":nest-hoop:");
  const nestDiagonals = withPart(":nest-diagonal:");
  assert.equal(branchMembers.length, NEST_BRANCHES);
  assert.equal(trussBraces.length, CROWN_TRUSSES * 27);
  assert.equal(nestHoops.length, CROWN_TRUSSES * 2);
  assert.equal(nestDiagonals.length, CROWN_TRUSSES);
  assert.ok(branchMembers.every((piece) => piece.textureProfile === "painted-steel"));
  assert.ok([...trussBraces, ...nestHoops, ...nestDiagonals].every((piece) =>
    piece.textureProfile === "painted-steel"));
  for (let truss = 0; truss < CROWN_TRUSSES; truss += 1) {
    assert.equal(withPart(`:truss-brace:${truss}:`).length, 27,
      `tetrahedron ${truss} must retain both triangular sections and all face braces`);
  }
  const degenerateBraces = [...trussBraces, ...nestHoops, ...nestDiagonals].filter((piece) =>
    (piece.rotation ?? [0, 0, 0]).every((angle) => Math.abs(angle) < 1e-8)
  );
  assert.equal(degenerateBraces.length, 0,
    "no brace may collapse to the default vertical orientation");

  // Validate the rendered cylinders, not only their authoring points. The
  // scene uses R = Rx·Ry·Rz; transform local +y to recover each cylinder cap.
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
  const upperCylinderCap = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    const ends = [-1, 1].map((sign) => piece.position.map((value, dimension) =>
      value + sign * axis[dimension] * piece.size[1] / 2));
    return ends[0][1] > ends[1][1] ? ends[0] : ends[1];
  };
  const branchesByIndex = new Map(branchMembers.map((piece) => [
    Number(piece.id.match(/:branch:(\d+):piece$/)[1]),
    piece,
  ]));
  for (let truss = 0; truss < CROWN_TRUSSES; truss += 1) {
    const caps = [3, 4, 5].map((offset) =>
      upperCylinderCap(branchesByIndex.get(truss * 6 + offset)));
    const capDistances = caps.flatMap((cap, index) =>
      caps.slice(index + 1).map((other) => Math.hypot(
        cap[0] - other[0],
        cap[1] - other[1],
        cap[2] - other[2],
      )));
    assert.ok(Math.max(...capDistances) < 1e-8,
      `rendered tetrahedron ${truss} misses its shared tip by ${Math.max(...capDistances)} m`);
  }

  const profile = CROWN_TRUSS_PROFILE;
  const tetrahedra = Array.from(
    { length: CROWN_TRUSSES },
    (_, truss) => crownTrussGeometry(truss / CROWN_TRUSSES * Math.PI * 2),
  );
  const tipKeys = new Set(tetrahedra.map((geometry) =>
    geometry.tip.map((value) => value.toFixed(9)).join(",")));
  assert.equal(tipKeys.size, 16, "the crown must have sixteen distinct vertices");

  for (const geometry of tetrahedra) {
    assert.equal(geometry.primaryEdges.length, 3);
    assert.ok(geometry.primaryEdges.every((edge) => edge.to === geometry.tip),
      "all three primary edges must share the exact same endpoint object");
    assert.equal(new Set(geometry.primaryEdges.map((edge) => edge.from)).size, 3,
      "a tetrahedron must start from three distinct base vertices");
    const outward = geometry.primaryEdges[0];
    const fromRadius = Math.hypot(outward.from[0], outward.from[2]);
    const toRadius = Math.hypot(outward.to[0], outward.to[2]);
    const angle = Math.atan2(toRadius - fromRadius, outward.to[1] - outward.from[1])
      * 180 / Math.PI;
    assert.ok(Math.abs(angle - CROWN_OUTER_EDGE_ANGLE_DEGREES) < 1e-9,
      `outer edge angle ${angle}° must be exactly ${CROWN_OUTER_EDGE_ANGLE_DEGREES}°`);
    const rearRadii = geometry.baseVertices.slice(1).map((vertex) =>
      Math.hypot(vertex[0], vertex[2]));
    assert.ok(rearRadii.every((radius) => fromRadius > radius),
      "the first primary edge must be the single radially outward edge");
  }

  const tipRadius = Math.hypot(tetrahedra[0].tip[0], tetrahedra[0].tip[2]);
  const tipY = tetrahedra[0].tip[1];
  const crownToSphere = tipRadius * 2 / SPHERE_DIAMETER;
  assert.ok(crownToSphere >= 1.58 && crownToSphere <= 1.68,
    `crown envelope ${crownToSphere.toFixed(2)} sphere diameters`);
  assert.ok(SPHERE_BOTTOM - profile.rootY > SPHERE_DIAMETER,
    "the crown must begin more than one sphere diameter below the ball");
  const sphereCentre = SPHERE_BOTTOM + SPHERE_DIAMETER / 2;
  assert.ok(Math.abs(tipY - sphereCentre) < 1.5,
    "tetrahedral tips must terminate in the sphere's equatorial zone");

  // Sample every primary chord where it passes the ball. The full 3D radius,
  // not a simplified profile, must remain clear of the gold skin.
  for (const geometry of tetrahedra) {
    assert.ok(geometry.baseVertices.every((vertex) => vertex[1] < SPHERE_BOTTOM),
      "the whole triangular base must sit below the gold skin");
    for (const edge of geometry.primaryEdges) {
      for (let sample = 0; sample <= 24; sample += 1) {
        const t = sample / 24;
        const point = edge.from.map((value, axis) =>
          value + (edge.to[axis] - value) * t);
        if (point[1] < SPHERE_BOTTOM) continue;
        const radius = Math.hypot(point[0], point[2]);
        const dy = point[1] - sphereCentre;
        const sphereSurface = Math.sqrt(Math.max(0, (SPHERE_DIAMETER / 2) ** 2 - dy ** 2));
        assert.ok(radius >= sphereSurface + 0.15,
          `tetrahedral chord at ${point[1].toFixed(2)} m intersects the gold skin`);
      }
    }
  }
});

test("the sphere holder stays subordinate to the crown and sphere", () => {
  const ring = baiterek.filter((piece) => /:gallery:\d+:piece$/.test(piece.id));
  const brackets = withPart(":gallery-bracket:");
  assert.equal(ring.length, 20);
  assert.equal(brackets.length, 8);
  assert.ok([...ring, ...brackets].every((piece) =>
    piece.size[0] <= 0.06 && piece.size[2] <= 0.06));
  assert.ok(ring.every((piece) => Math.hypot(piece.position[0], piece.position[2]) < 3.3));
  assert.ok([...ring, ...brackets].every((piece) => piece.textureProfile === "painted-steel"));
});

test("the sphere is a continuous mirrored-gold skin, not a tile mosaic", () => {
  const skin = baiterek.filter((piece) => /:sphere:\d+:\d+:piece$/.test(piece.id));
  assert.equal(skin.length, 7 * 24);
  assert.ok(skin.every((piece) => piece.textureProfile === "gold-mirror"));
  assert.ok(new Set(skin.map((piece) => piece.color)).size <= 4);
  assert.equal(withPart(":mast-ball").length, 0, "the original ends in a needle, not a knob");
});

test("Baiterek repeats the original dusk lighting hierarchy", () => {
  const lamps = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes("baiterek:"));
  const uplights = lamps.filter((lamp) => lamp.id.includes(":uplight:"));
  const crownLights = lamps.filter((lamp) => lamp.id.includes(":gallery-lamp:"));
  assert.equal(uplights.length, BAITEREK_UPLIGHTS,
    "the shaft needs four broad uplight washes");
  assert.equal(crownLights.length, BAITEREK_CROWN_LIGHTS,
    "the lower sphere needs an eight-light golden necklace");
  assert.equal(lamps.length, BAITEREK_UPLIGHTS + BAITEREK_CROWN_LIGHTS,
    "the sphere and antenna must not become separate glowing objects");

  assert.ok(uplights.every((lamp) =>
    lamp.color === BAITEREK_SHAFT_LIGHT_COLOR
      && lamp.intensity >= 13
      && lamp.distance >= 34),
  "shaft projectors must be warm, strong and tall enough for the full trunk");
  assert.ok(crownLights.every((lamp) =>
    lamp.color === BAITEREK_CROWN_LIGHT_COLOR
      && lamp.intensity >= 12
      && lamp.distance >= 32),
  "the crown ring must be warmer and concentrated below the sphere");

  const groups = new Set(lamps.map((lamp) => lamp.poolGroupId));
  assert.equal(groups.size, 1,
    "the base and crown lighting must enter the shared pool as one monument");
  assert.ok(lamps.every((lamp) =>
    lamp.poolPriority >= 32
      && lamp.localPoolCapacity === 12
      && lamp.dayIntensityFactor === 0.06),
  "the complete landmark must keep its night lighting at Khan Shatyr range");
  assert.ok(lamps.every((lamp) =>
    lamp.transition?.fadeInSeconds === 0.35
      && lamp.transition?.fadeOutSeconds === 0.25),
  "the complete monument must fade in without individual sections blinking");

  const sphereSkin = withPart(":sphere:");
  const lowestSpherePanel = Math.min(...sphereSkin.map((piece) => piece.position[1]));
  assert.ok(crownLights.every((lamp) => lamp.position[1] < lowestSpherePanel),
    "crown sources must remain below the mirrored skin");
  assert.ok(lamps.every((lamp) =>
    !lamp.id.includes(":sphere:")
      && !lamp.id.includes(":mast")
      && !lamp.id.includes(":branch:")),
  "the ball, needle and tetrahedral tips must stay reflective, not emissive");
});

test("the landmark includes its entrance and remains structurally stable", () => {
  assert.equal(withPart(":vestibule-glass:").length, 9);
  assert.equal(withPart(":vestibule-mullion:").length, 8);
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});
