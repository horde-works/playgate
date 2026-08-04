import assert from "node:assert/strict";
import test from "node:test";
import { northHollandStolpFarmObject } from "../games/make-a-mess/src/content/objects/dutchHouses/northHollandStolpFarmObject.ts";
import { zaanTimberMerchantHouseObject } from "../games/make-a-mess/src/content/objects/dutchHouses/zaanTimberMerchantHouseObject.ts";
import { dutchLandscapeLitBridgeParts } from "../games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts";
import { deKatObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/deKatObject.ts";
import { gekroondePoelenburgPaltrokObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";
import { jongeSchaapSawmillObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/jongeSchaapSawmillObject.ts";
import { oudegeinWipmolenObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/oudegeinWipmolenObject.ts";
import { dutchPolderPrefabLibrary } from "../games/make-a-mess/src/content/prefabs/dutchPolderPrefabs.ts";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { dutchPolderDocument } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderDocument.ts";
import { selectGroupedLampCandidates } from "../games/make-a-mess/src/game/lampPoolSelection.ts";

const models = [
  deKatObject,
  oudegeinWipmolenObject,
  jongeSchaapSawmillObject,
  gekroondePoelenburgPaltrokObject,
  zaanTimberMerchantHouseObject,
  northHollandStolpFarmObject,
];
const allCanonicalParts = [...models.flatMap(({ parts }) => parts), ...dutchLandscapeLitBridgeParts];
const lensParts = allCanonicalParts.filter(({ material }) => material === "lamp-glass");
const bulbParts = allCanonicalParts.filter(({ material }) => material === "lamp-bulb");

test("every polder source is a visible bulb contained by a separate transparent lens", () => {
  assert.equal(lensParts.length, 18);
  assert.equal(bulbParts.length, lensParts.length);
  for (const lens of lensParts) {
    assert.equal(lens.kind, "box", lens.id);
    assert.equal(lens.light, undefined, lens.id);
    const prefix = lens.id.slice(0, -":lens".length);
    const bulb = bulbParts.find(({ id, center }) => id === `${prefix}:bulb`
      && center.every((value, axis) => value === lens.center[axis]));
    assert.ok(bulb, prefix);
    assert.equal(bulb.kind, "box", bulb.id);
    assert.ok(bulb.size.every((size, axis) => size < lens.size[axis]), bulb.id);
    assert.ok(bulb.center.every((center, axis) => (
      Math.abs(center - lens.center[axis]) + bulb.size[axis] / 2 < lens.size[axis] / 2
    )), bulb.id);
    assert.ok(bulb.light, bulb.id);
    assert.deepEqual(bulb.light.position, bulb.center, bulb.id);
    assert.equal(bulb.light.localPoolCapacity, 12, bulb.id);
    assert.equal(bulb.light.reservePoolGroup, true, bulb.id);
    assert.equal(bulb.light.beacon, undefined, bulb.id);
    assert.ok(bulb.light.distance >= 16, bulb.id);
    assert.ok(bulb.light.intensity >= 14, bulb.id);
  }
  assert.equal(allCanonicalParts.filter((part) => part.light && part.material !== "lamp-bulb").length, 0);
});

test("fixture support chain includes carrier plate or hook, arm or chain, cap and base", () => {
  for (const lens of lensParts) {
    const prefix = lens.id.slice(0, -":lens".length);
    const ids = new Set(allCanonicalParts.filter(({ id }) => id.startsWith(`${prefix}:`)).map(({ id }) => id));
    assert.ok(ids.has(`${prefix}:cap`), prefix);
    assert.ok(ids.has(`${prefix}:base`), prefix);
    const hanging = ids.has(`${prefix}:ceiling-plate`);
    assert.ok(hanging || ids.has(`${prefix}:mounting-plate`), prefix);
    assert.ok(ids.has(`${prefix}:${hanging ? "chain" : "arm"}`), prefix);
  }
});

const partBounds = (part) => {
  if (part.kind === "box") {
    return part.center.map((value, axis) => [value - part.size[axis] / 2, value + part.size[axis] / 2]);
  }
  if (part.kind === "beam") {
    const margin = Math.max(part.width, part.depth) / 2;
    return part.from.map((value, axis) => [
      Math.min(value, part.to[axis]) - margin,
      Math.max(value, part.to[axis]) + margin,
    ]);
  }
  return undefined;
};

const boundsOverlap = (left, right) => left.every(([minimum, maximum], axis) => (
  Math.min(maximum, right[axis][1]) - Math.max(minimum, right[axis][0]) > 0.001
));

test("every exterior mounting plate lands on opaque carrier geometry, never an opening or pane", () => {
  for (const [model, prefix, plateSuffix] of [
    [deKatObject, "front-entry-lantern", "mounting-plate"],
    [oudegeinWipmolenObject, "upper-eave-lantern", "ceiling-plate"],
    [zaanTimberMerchantHouseObject, "front-entry-lantern", "mounting-plate"],
    [northHollandStolpFarmObject, "service-entry-lantern", "mounting-plate"],
  ]) {
    const plate = model.parts.find(({ id }) => id === `${prefix}:${plateSuffix}`);
    assert.ok(plate, `${model.id}:${prefix}`);
    const plateBounds = partBounds(plate);
    assert.ok(plateBounds, plate.id);
    const carrier = model.parts.find((part) => {
      if (part.group === "lighting-fixtures" || part.id.startsWith(`${prefix}:`)) return false;
      if (["glazing", "opening", "dark-recess", "lamp-glass", "lamp-bulb"].includes(part.material)) return false;
      const bounds = partBounds(part);
      return bounds && boundsOverlap(plateBounds, bounds);
    });
    assert.ok(carrier, `${plate.id} has no opaque carrier overlap`);
    const falseCarrier = model.parts.find((part) => {
      if (!["glazing", "opening", "dark-recess"].includes(part.material)) return false;
      const bounds = partBounds(part);
      return bounds && boundsOverlap(plateBounds, bounds);
    });
    assert.equal(falseCarrier, undefined, `${plate.id} overlaps ${falseCarrier?.id}`);
  }
});

test("working and exterior pools stay strong enough to reveal nearby materials", () => {
  for (const bulb of bulbParts) {
    const light = bulb.light;
    if (/saw-floor|open-floor|workshop|front-gable-window-interior/.test(bulb.id)) {
      assert.ok(light.distance >= 22, bulb.id);
      assert.ok(light.intensity >= 22, bulb.id);
    }
    if (/entry|bridge-lantern|upper-eave/.test(bulb.id)) {
      assert.ok(light.distance >= 24, bulb.id);
      assert.ok(light.intensity >= 24, bulb.id);
      assert.equal(light.dayIntensityFactor, 0, bulb.id);
    }
  }
});

test("night studies use ordinary transparent windows and visible interior bulbs", () => {
  const windows = models.flatMap(({ parts }) => parts).filter(({ id, material }) => id.includes("window") && material === "glazing");
  assert.equal(models.flatMap(({ parts }) => parts).some(({ material }) => material === "lit-glazing"), false);
  assert.equal(windows.length, 33);
  assert.ok(windows.every(({ light }) => light === undefined));
  for (const model of models) {
    const nightViews = model.views.filter(({ lighting }) => lighting === "night");
    assert.ok(nightViews.length >= 1, model.id);
    assert.ok(nightViews.every(({ hiddenGroups }) => hiddenGroups === undefined), model.id);
    for (const part of model.parts) {
      if (/roof|shell|cladding/.test(`${part.id}:${part.group}`)) {
        assert.notEqual(part.material, "lamp-bulb", part.id);
      }
    }
  }
});

test("interior window bulbs are offset from central mullions and have fixed exterior proof views", () => {
  const cases = [
    [deKatObject, "smock-window-interior-lamp:bulb", "night-window"],
    [jongeSchaapSawmillObject, "front-gable-window-interior-lamp:bulb", "night-gable-window"],
  ];
  for (const [model, bulbId, viewId] of cases) {
    const bulb = model.parts.find(({ id }) => id === bulbId);
    assert.ok(bulb, bulbId);
    assert.equal(bulb.kind, "box", bulbId);
    assert.ok(Math.abs(bulb.center[0]) >= 0.25, bulbId);
    const view = model.views.find(({ id }) => id === viewId);
    assert.ok(view, viewId);
    assert.equal(view.lighting, "night", viewId);
    assert.equal(view.hiddenGroups, undefined, viewId);
  }
});

test("only B1, B3 and B5 receive instance-scoped bridge lantern groups", () => {
  const bridges = dutchPolderDocument.groups
    .flatMap(({ objects }) => objects)
    .filter(({ id }) => /^B[1-5]$/.test(id));
  assert.deepEqual(bridges.map(({ id, prefab }) => [id, prefab]), [
    ["B1", "dutch:landscape:bridge-lit-b1"],
    ["B2", "dutch:landscape:bridge"],
    ["B3", "dutch:landscape:bridge-lit-b3"],
    ["B4", "dutch:landscape:bridge"],
    ["B5", "dutch:landscape:bridge-lit-b5"],
  ]);
  for (const bridgeId of ["b1", "b3", "b5"]) {
    const prefab = dutchPolderPrefabLibrary.get(`dutch:landscape:bridge-lit-${bridgeId}`);
    const groups = new Set(prefab.pieces.flatMap((piece) => piece.light?.poolGroupId ?? []));
    assert.deepEqual([...groups], [`dutch-polder:${bridgeId}-bridge`]);
  }
});

test("compiled scene keeps all nine night clusters represented inside a twelve-light pool", () => {
  const compiled = compileSceneGroups(dutchPolderDocument, dutchPolderPrefabLibrary);
  assert.equal(compiled.lamps.length, 22);
  assert.ok(compiled.lamps.every(({ localPoolCapacity }) => localPoolCapacity === 12));
  assert.ok(compiled.lamps.every(({ reservePoolGroup }) => reservePoolGroup));
  assert.ok(compiled.lamps.every(({ beacon }) => beacon === undefined));
  const candidates = compiled.lamps.map((lamp, index) => ({ lamp, rank: index + 1 }));
  const selected = selectGroupedLampCandidates(candidates, 12);
  assert.equal(selected.length, 12);
  assert.deepEqual(
    new Set(selected.map(({ lamp }) => lamp.poolGroupId)),
    new Set(compiled.lamps.map(({ poolGroupId }) => poolGroupId)),
  );
});
