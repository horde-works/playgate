import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { tiltHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";

const expectations = JSON.parse(fs.readFileSync(new URL(
  "../games/make-a-mess/docs/tilt-hexacopter/evidence/e02-systems-expectations.json",
  import.meta.url,
), "utf8"));
const parts = tiltHexacopterObject.parts;
const prefixCount = (prefix) => parts.filter(({ id }) => id.startsWith(prefix)).length;
const bounds = (part) => {
  if (part.kind === "mesh") return {
    min: [0, 1, 2].map((axis) => Math.min(...part.vertices.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...part.vertices.map((point) => point[axis]))),
  };
  if (part.kind === "box") return {
    min: part.center.map((value, axis) => value - part.size[axis] / 2),
    max: part.center.map((value, axis) => value + part.size[axis] / 2),
  };
  return {
    min: [0, 1, 2].map((axis) => Math.min(part.from[axis], part.to[axis]) - (part.radius ?? 0)),
    max: [0, 1, 2].map((axis) => Math.max(part.from[axis], part.to[axis]) + (part.radius ?? 0)),
  };
};

test("E02 adds the declared serviceable internal architecture", () => {
  assert.equal(prefixCount("crew-seat-"), expectations.counts.crewStations);
  assert.equal(prefixCount("energy-module-"), expectations.counts.energyModules);
  assert.equal(prefixCount("tilt-actuator-"), expectations.counts.ringActuators);
  assert.equal(prefixCount("high-voltage-bus-"), expectations.counts.highVoltageBuses);
  assert.equal(prefixCount("coolant-supply-") + prefixCount("coolant-return-"), expectations.counts.coolantTrunks);
  assert.equal(prefixCount("heat-exchanger-"), expectations.counts.heatExchangers);
  assert.equal(prefixCount("coolant-pump-"), expectations.counts.coolantPumps);
});

test("crew and energy packages remain in their independent longitudinal zones", () => {
  const crew = parts.filter(({ group }) => group === "crew-cell" || group === "crew-armour").map(bounds);
  const energy = parts.filter(({ group }) => group === "energy-storage").map(bounds);
  assert.ok(crew.length >= 6);
  assert.ok(energy.length === expectations.counts.energyModules);
  assert.ok(Math.min(...crew.map(({ min }) => min[2])) >= expectations.zones.crewZ[0] - 0.01);
  assert.ok(Math.max(...crew.map(({ max }) => max[2])) <= expectations.zones.crewZ[1] + 0.01);
  assert.ok(Math.min(...energy.map(({ min }) => min[2])) >= expectations.zones.energyZ[0] - 0.01);
  assert.ok(Math.max(...energy.map(({ max }) => max[2])) <= expectations.zones.energyZ[1] + 0.01);
});

test("each ring has a local actuator adjacent to its eccentric hinge", () => {
  for (const hinge of Object.values(tiltHexacopterObject.surfaceHinges)) {
    const actuator = parts.find(({ id }) => id === `tilt-actuator-${hinge.id}`);
    assert.equal(actuator?.kind, "cylinder");
    const centre = actuator.from.map((value, axis) => (value + actuator.to[axis]) / 2);
    assert.ok(Math.hypot(centre[0] - hinge.pivot[0], centre[1] - hinge.pivot[1]) < 0.4);
    assert.equal(actuator.group, "ring-actuators");
  }
});

test("systems geometry does not become part of the accepted exterior groups", () => {
  const systemGroups = new Set(["crew-cell", "avionics", "energy-storage", "power-distribution", "cooling-system", "ring-actuators"]);
  assert.ok(parts.filter((part) => systemGroups.has(part.group)).length >= 30);
  for (const id of expectations.forbiddenExteriorChanges) {
    const part = parts.find((candidate) => candidate.id === id);
    assert.ok(part, id);
    assert.equal(systemGroups.has(part.group), false, id);
  }
});

test("the E02 drawing views expose internal packaging without replacing E01 views", () => {
  const viewIds = new Set(tiltHexacopterObject.views.map(({ id }) => id));
  for (const id of expectations.requiredViews) assert.ok(viewIds.has(id), id);
  for (const id of ["top", "front", "left", "rear", "structural-exterior", "structural-cutaway"]) assert.ok(viewIds.has(id), id);
});
