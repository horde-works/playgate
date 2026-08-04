import assert from "node:assert/strict";
import test from "node:test";
import {
  JONGE_SCHAAP_CAP_CROWN_Y,
  JONGE_SCHAAP_FIXED_ROTOR_PHASE_DEGREES,
  JONGE_SCHAAP_GALLERY_OUTER_DIAMETER,
  JONGE_SCHAAP_GALLERY_Y,
  JONGE_SCHAAP_HUB_Y,
  JONGE_SCHAAP_ROTOR_RADIUS,
  JONGE_SCHAAP_ROTOR_PLANE_Z,
  JONGE_SCHAAP_ROTOR_SPAN,
  JONGE_SCHAAP_TOWER_CENTRE_Z,
  JONGE_SCHAAP_TRANSMISSION_RATIO,
  jongeSchaapSawmillObject,
} from "../games/make-a-mess/src/content/objects/dutchWindmills/jongeSchaapSawmillObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rotorPlaneDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("паспорт M3 фиксирует опубликованные размеры и передаточное число", () => {
  assert.equal(JONGE_SCHAAP_ROTOR_SPAN, 20.68);
  assert.equal(JONGE_SCHAAP_ROTOR_RADIUS, 10.34);
  assert.equal(JONGE_SCHAAP_GALLERY_Y, 5.5);
  assert.equal(JONGE_SCHAAP_GALLERY_OUTER_DIAMETER, 11.6);
  assert.equal(JONGE_SCHAAP_TRANSMISSION_RATIO, 2.44);
  assert.equal(JONGE_SCHAAP_HUB_Y, 13.7);
  assert.equal(JONGE_SCHAAP_CAP_CROWN_Y, 16.5);
  assert.equal(jongeSchaapSawmillObject.dimensions.maximumOperatingHeight, 24.04);
});

test("лесопилка остаётся шестиугольной башней на длинном производственном основании", () => {
  const groups = new Set(jongeSchaapSawmillObject.parts.map((part) => part.group));
  assert.ok(groups.has("tower"));
  assert.ok(groups.has("saw-hall"));
  assert.ok(groups.has("saw-frames"));
  assert.ok(groups.has("log-carriages"));
  assert.ok(groups.has("windery"));
  assert.ok(groups.has("drivetrain"));
  const tower = jongeSchaapSawmillObject.parts.find((part) => part.id === "hexagonal-smock");
  assert.equal(tower?.kind, "mesh");
  assert.equal(tower?.vertices.length, 28);
  assert.equal(jongeSchaapSawmillObject.dimensions.sawHallDepth, 20);
  assert.equal(jongeSchaapSawmillObject.dimensions.sawHallWidth, 13.8);
});

test("полная окружность ротора проходит перед передним свесом крыши", () => {
  const roofFrontZ = 11.2;
  assert.equal(JONGE_SCHAAP_TOWER_CENTRE_Z, 6.45);
  assert.equal(JONGE_SCHAAP_ROTOR_PLANE_Z, 11.8);
  assert.ok(JONGE_SCHAAP_ROTOR_PLANE_Z - roofFrontZ >= 0.5);
  assert.equal(jongeSchaapSawmillObject.rotor.pivot[2], JONGE_SCHAAP_ROTOR_PLANE_Z);
});

test("башня проходит внутрь корпуса, а крыша заканчивается явным воротником", () => {
  const cornerPosts = jongeSchaapSawmillObject.parts.filter((part) => /^tower-corner-\d$/.test(part.id));
  assert.equal(cornerPosts.length, 6);
  assert.ok(cornerPosts.every((part) => part.kind === "beam" && part.from[1] < 0.5));
  assert.ok(jongeSchaapSawmillObject.parts.some((part) => part.group === "roof-joint"));
  assert.ok(jongeSchaapSawmillObject.parts.some((part) => part.id === "saw-hall-roof-front-left"));
  assert.ok(jongeSchaapSawmillObject.parts.some((part) => part.id === "saw-hall-roof-front-right"));
  assert.ok(!jongeSchaapSawmillObject.parts.some((part) => part.id === "saw-hall-roof"));
});

test("оба въезда имеют по две створки на собственных петлях выше рельсов", () => {
  const leaves = jongeSchaapSawmillObject.parts.filter((part) => part.kind === "box" && part.group === "saw-hall-doors");
  const hinges = jongeSchaapSawmillObject.parts.filter((part) => part.kind === "cylinder" && /front-door-.*-hinge-/.test(part.id));
  assert.deepEqual(leaves.map((part) => part.id), [
    "front-door-left-outer", "front-door-left-inner",
    "front-door-right-inner", "front-door-right-outer",
  ]);
  assert.equal(hinges.length, 8);
  for (const leaf of leaves) {
    assert.equal(leaf.kind, "box");
    const leafBottom = leaf.center[1] - leaf.size[1] / 2;
    const railTop = 0.48 + 0.12 / 2;
    assert.ok(leafBottom > railTop, `${leaf.id}: створка задевает рельс`);
  }
});

test("внутри действительно три пильные рамы, две тележки и две воротные установки", () => {
  const frameHeads = jongeSchaapSawmillObject.parts.filter((part) => /^saw-frame-\d-head$/.test(part.id));
  const carriageBeds = jongeSchaapSawmillObject.parts.filter((part) => /^carriage-\d-bed$/.test(part.id));
  const winderyDrums = jongeSchaapSawmillObject.parts.filter((part) => /^windery-\d-drum$/.test(part.id));
  const connectingRods = jongeSchaapSawmillObject.parts.filter((part) => /^crank-\d-connecting-rod$/.test(part.id));
  assert.equal(frameHeads.length, 3);
  assert.equal(carriageBeds.length, 2);
  assert.equal(winderyDrums.length, 2);
  assert.equal(connectingRods.length, 3);
});

test("четыре маха заканчиваются на окружности 20,68 м", () => {
  const stocks = jongeSchaapSawmillObject.parts.filter((part) => /^rotor-\d-stock$/.test(part.id));
  assert.equal(stocks.length, 4);
  for (const stock of stocks) {
    assert.equal(stock.kind, "beam");
    assert.ok(Math.abs(rotorPlaneDistance(stock.to, jongeSchaapSawmillObject.rotor.pivot) - JONGE_SCHAAP_ROTOR_RADIUS) < 1e-9, stock.id);
  }
});

test("ветер, поворот шапки и производственные механизмы явно заморожены", () => {
  assert.equal(jongeSchaapSawmillObject.rotor.fixedPhaseDegrees, JONGE_SCHAAP_FIXED_ROTOR_PHASE_DEGREES);
  assert.equal(jongeSchaapSawmillObject.rotor.windCoupling, false);
  assert.equal(jongeSchaapSawmillObject.motionConstraints?.windSimulation, false);
  assert.equal(jongeSchaapSawmillObject.motionConstraints?.capYaw, false);
  assert.equal(jongeSchaapSawmillObject.motionConstraints?.sawFrameMotion, false);
  assert.equal(jongeSchaapSawmillObject.motionConstraints?.logCarriageMotion, false);
  assert.equal(jongeSchaapSawmillObject.motionConstraints?.sailRotation, "constant-only");
});

test("все детали невырождены и ids уникальны", () => {
  assert.equal(new Set(jongeSchaapSawmillObject.parts.map((part) => part.id)).size, jongeSchaapSawmillObject.parts.length);
  for (const part of jongeSchaapSawmillObject.parts) {
    if (part.kind === "beam" || part.kind === "cylinder") {
      assert.ok(distance(part.from, part.to) > 0.04, `${part.id}: нулевая длина`);
    }
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("приёмочные камеры проверяют массу и производственную причинность отдельно", () => {
  const ids = jongeSchaapSawmillObject.views.map((view) => view.id);
  assert.deepEqual(ids, [
    "front", "left", "rear", "three-quarter-left", "three-quarter-right",
    "high-three-quarter", "saw-workflow", "crankshaft", "night-saw-floor", "night-gable-window", "silhouette",
  ]);
  const crankshaft = jongeSchaapSawmillObject.views.find((view) => view.id === "crankshaft");
  assert.deepEqual(crankshaft?.hiddenGroups, [
    "tower", "cap", "rotor", "gallery", "saw-hall", "roof-joint", "saw-hall-doors",
  ]);
});
