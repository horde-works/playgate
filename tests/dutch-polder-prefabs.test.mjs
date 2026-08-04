import assert from "node:assert/strict";
import test from "node:test";
import {
  dutchLandscapeBeanFrameParts,
  dutchLandscapeDryingLineParts,
  dutchLandscapeHandPumpParts,
  dutchLandscapeJettyParts,
  dutchLandscapeMooringPostParts,
  dutchLandscapePeatStoreParts,
  dutchLandscapePicketFenceParts,
  dutchLandscapePrivyParts,
  dutchLandscapeRainBarrelParts,
  dutchLandscapeSchouwParts,
} from "../games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts";
import { zaanYardShedParts } from "../games/make-a-mess/src/content/objects/dutchLandscape/zaanYardShedObject.ts";
import { deKatObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/deKatObject.ts";
import { gekroondePoelenburgPaltrokObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";
import { jongeSchaapSawmillObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/jongeSchaapSawmillObject.ts";
import { oudegeinWipmolenObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/oudegeinWipmolenObject.ts";
import {
  canonicalPartToPrefabPiece,
  dutchPolderPrefabDefinitions,
  dutchPolderPrefabLibrary,
} from "../games/make-a-mess/src/content/prefabs/dutchPolderPrefabs.ts";

test("adapter preserves one canonical part as one scene prefab piece", () => {
  const canonicalCount = dutchPolderPrefabDefinitions.reduce((sum, prefab) => sum + prefab.pieces.length, 0);
  assert.ok(canonicalCount > 1200);
  assert.equal(new Set(dutchPolderPrefabDefinitions.map(({ id }) => id)).size, dutchPolderPrefabDefinitions.length);
  for (const prefab of dutchPolderPrefabDefinitions) {
    assert.equal(new Set(prefab.pieces.map(({ id }) => id)).size, prefab.pieces.length, prefab.id);
  }
  assert.equal(dutchPolderPrefabLibrary.size, dutchPolderPrefabDefinitions.length);
});

test("all eleven accepted yard objects are code-registered from their canonical parts without placement", () => {
  const expected = new Map([
    ["dutch:landscape:schouw", dutchLandscapeSchouwParts],
    ["dutch:landscape:mooring-posts", dutchLandscapeMooringPostParts],
    ["dutch:landscape:jetty", dutchLandscapeJettyParts],
    ["dutch:landscape:yard-shed", zaanYardShedParts],
    ["dutch:landscape:peat-store", dutchLandscapePeatStoreParts],
    ["dutch:landscape:privy", dutchLandscapePrivyParts],
    ["dutch:landscape:hand-pump", dutchLandscapeHandPumpParts],
    ["dutch:landscape:drying-line", dutchLandscapeDryingLineParts],
    ["dutch:landscape:bean-frame", dutchLandscapeBeanFrameParts],
    ["dutch:landscape:picket-fence", dutchLandscapePicketFenceParts],
    ["dutch:landscape:rain-barrel", dutchLandscapeRainBarrelParts],
  ]);
  assert.equal(expected.size, 11);
  for (const [id, canonicalParts] of expected) {
    const definition = dutchPolderPrefabLibrary.get(id);
    assert.ok(definition, id);
    assert.equal(definition.pieces.length, canonicalParts.length, id);
    assert.deepEqual(definition.pieces.map(({ id: pieceId }) => pieceId), canonicalParts.map(({ id: partId }) => partId), id);
    assert.equal(definition.tags.includes("yard"), true, id);
  }
});

test("yard prefab materials preserve the established Dutch palette", () => {
  const rainBarrel = dutchPolderPrefabLibrary.get("dutch:landscape:rain-barrel");
  const byId = new Map(rainBarrel.pieces.map((piece) => [piece.id, piece]));
  for (let stave = 0; stave < 12; stave += 1) {
    const piece = byId.get(`rain-barrel-stave:${stave}`);
    assert.equal(piece.material, "wood");
    assert.equal(piece.color, "#6f5035");
  }
  for (const id of ["rain-barrel-hoops", "rain-barrel-wall-brackets"]) {
    assert.equal(byId.get(id).material, "steel");
    assert.equal(byId.get(id).color, "#535a5d");
  }
  for (const id of ["rain-barrel-brick:-0.18", "rain-barrel-brick:0.18"]) {
    assert.equal(byId.get(id).material, "brick");
    assert.equal(byId.get(id).color, "#8a5944");
  }
  assert.equal(byId.get("rain-barrel-downspout").material, "wood");
  assert.equal(byId.get("rain-barrel-downspout").color, "#35291f");

  const beanFrame = dutchPolderPrefabLibrary.get("dutch:landscape:bean-frame");
  assert.equal(beanFrame.pieces.find(({ id }) => id === "bean-frame-soil-bed").material, "soil");
  assert.equal(beanFrame.pieces.find(({ id }) => id === "bean-frame-soil-bed").color, "#5c4431");
  assert.ok([...byId.values(), ...beanFrame.pieces].every((piece) => piece.opacity === undefined && piece.transparent === undefined));
});

test("four mills split fixed construction from the exact canonical rotor group", () => {
  for (const id of ["m1-de-kat", "m2-oudegein", "m3-jonge-schaap", "m4-poelenburg"]) {
    assert.ok(dutchPolderPrefabLibrary.has(`dutch:${id}:fixed`));
    assert.ok(dutchPolderPrefabLibrary.has(`dutch:${id}:rotor`));
  }
  const canonicalRotor = deKatObject.parts.filter(({ group }) => group === "rotor");
  const prefabRotor = dutchPolderPrefabLibrary.get("dutch:m1-de-kat:rotor");
  assert.equal(prefabRotor.pieces.length, canonicalRotor.length);
  assert.deepEqual(prefabRotor.pieces.map(({ id }) => id), canonicalRotor.map(({ id }) => id));
});

test("mill studies keep glazing distinct from opaque recesses and cutaway helpers", () => {
  const mills = [
    deKatObject,
    oudegeinWipmolenObject,
    jongeSchaapSawmillObject,
    gekroondePoelenburgPaltrokObject,
  ];
  const parts = mills.flatMap(({ parts: millParts }) => millParts);
  const glazing = parts.filter(({ material }) => material === "glazing");
  const darkRecesses = parts.filter(({ material }) => material === "dark-recess");

  assert.equal(parts.some(({ material }) => material === "opening"), false);
  assert.equal(parts.some(({ material }) => material === "lit-glazing"), false);
  assert.equal(parts.some(({ id }) => id === "underframe-shadow-core"), false);
  assert.equal(glazing.length, 15);
  assert.equal(darkRecesses.length, 4);
  assert.ok(glazing.every(({ id }) => /window/.test(id) && id.endsWith(":glass")));
  assert.ok(darkRecesses.every(({ id }) => /door/.test(id)));

  for (const part of glazing) {
    const adapted = canonicalPartToPrefabPiece(part);
    assert.equal(adapted.material, "darkGlass");
    assert.equal(adapted.shape, "glassPane");
  }
  for (const part of darkRecesses) {
    const adapted = canonicalPartToPrefabPiece(part);
    assert.notEqual(adapted.material, "glass");
    assert.notEqual(adapted.material, "darkGlass");
  }
});

const rayTriangleDistance = (origin, direction, part, triangle) => {
  const [a, b, c] = triangle.map((index) => part.vertices[index]);
  const edge1 = b.map((value, axis) => value - a[axis]);
  const edge2 = c.map((value, axis) => value - a[axis]);
  const cross = (left, right) => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
  const dot = (left, right) => left.reduce((sum, value, axis) => sum + value * right[axis], 0);
  const h = cross(direction, edge2);
  const determinant = dot(edge1, h);
  if (Math.abs(determinant) < 1e-9) return Infinity;
  const inverse = 1 / determinant;
  const s = origin.map((value, axis) => value - a[axis]);
  const u = inverse * dot(s, h);
  if (u < -1e-7 || u > 1 + 1e-7) return Infinity;
  const q = cross(s, edge1);
  const v = inverse * dot(direction, q);
  if (v < -1e-7 || u + v > 1 + 1e-7) return Infinity;
  const distance = inverse * dot(edge2, q);
  return distance >= 0 ? distance : Infinity;
};

const rayHitsBoxNear = (origin, axis, part, maximumDistance) => {
  if (part.rotation?.some((value) => Math.abs(value) > 1e-8)) return false;
  for (let parallel = 0; parallel < 3; parallel += 1) {
    if (parallel === axis) continue;
    if (Math.abs(origin[parallel] - part.center[parallel]) > part.size[parallel] / 2 + 1e-7) return false;
  }
  const minimum = part.center[axis] - part.size[axis] / 2;
  const maximum = part.center[axis] + part.size[axis] / 2;
  return minimum <= origin[axis] + maximumDistance && maximum >= origin[axis] - maximumDistance;
};

test("all fifteen mill windows have wall voids, reveals, frames and ordinary glass", () => {
  const mills = [deKatObject, oudegeinWipmolenObject, jongeSchaapSawmillObject, gekroondePoelenburgPaltrokObject];
  const windows = mills.flatMap((model) => model.parts
    .filter(({ material, id }) => material === "glazing" && id.endsWith(":glass"))
    .map((glass) => ({ model, glass })));
  assert.equal(windows.length, 15);

  for (const { model, glass } of windows) {
    assert.equal(glass.kind, "box", glass.id);
    const prefix = glass.id.slice(0, -":glass".length);
    const byId = new Map(model.parts.map((part) => [part.id, part]));
    for (const suffix of [
      "frame-left", "frame-right", "frame-head", "frame-sill",
      "reveal-left", "reveal-right", "reveal-head", "reveal-sill",
    ]) assert.ok(byId.has(`${prefix}:${suffix}`), `${prefix}:${suffix}`);

    const thinAxis = glass.size.indexOf(Math.min(...glass.size));
    for (const suffix of ["reveal-left", "reveal-right", "reveal-head", "reveal-sill"]) {
      const reveal = byId.get(`${prefix}:${suffix}`);
      assert.equal(reveal.kind, "box", reveal.id);
      assert.ok(reveal.size[thinAxis] >= 0.19, `${reveal.id} has no inward reveal depth`);
    }

    const shellParts = model.parts.filter(({ material, id }) => (
      ["cladding", "thatch", "brick"].includes(material) && !id.includes("interior")
    ));
    const directions = [-1, 1].map((sign) => [0, 0, 0].map((_, axis) => axis === thinAxis ? sign : 0));
    for (const shell of shellParts) {
      if (shell.kind === "box") {
        assert.equal(rayHitsBoxNear(glass.center, thinAxis, shell, 0.45), false, `${glass.id} is backed by ${shell.id}`);
      }
      if (shell.kind === "mesh") {
        const nearest = Math.min(...directions.flatMap((direction) => shell.triangles.map((triangle) => (
          rayTriangleDistance(glass.center, direction, shell, triangle)
        ))));
        assert.ok(nearest > 0.45, `${glass.id} is backed by ${shell.id} at ${nearest.toFixed(4)} m`);
      }
    }
  }
});

test("fixture glass stays transparent while only its contained bulb emits", () => {
  const fixtureParts = [
    deKatObject,
    oudegeinWipmolenObject,
    jongeSchaapSawmillObject,
    gekroondePoelenburgPaltrokObject,
  ].flatMap(({ parts }) => parts).filter(({ material }) => material === "lamp-glass" || material === "lamp-bulb");
  const lenses = fixtureParts.filter(({ material }) => material === "lamp-glass");
  const bulbs = fixtureParts.filter(({ material }) => material === "lamp-bulb");
  assert.equal(lenses.length, bulbs.length);
  for (const lens of lenses) {
    const adapted = canonicalPartToPrefabPiece(lens);
    assert.equal(adapted.material, "glass");
    assert.equal(adapted.shape, "glassPane");
    assert.equal(adapted.color, "#b9c7c8");
    assert.equal(adapted.light, undefined);
  }
  for (const bulb of bulbs) {
    const adapted = canonicalPartToPrefabPiece(bulb);
    assert.equal(adapted.material, "glass");
    assert.equal(adapted.shape, "glassPane");
    assert.ok(adapted.light, bulb.id);
  }
});

const triangleNormal = (part, [aIndex, bIndex, cIndex]) => {
  const a = part.vertices[aIndex];
  const b = part.vertices[bIndex];
  const c = part.vertices[cIndex];
  const ab = b.map((value, axis) => value - a[axis]);
  const ac = c.map((value, axis) => value - a[axis]);
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
};

const meshIsClosed = (part) => {
  const edgeUses = new Map();
  for (const [a, b, c] of part.triangles) {
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const edge = from < to ? `${from}:${to}` : `${to}:${from}`;
      edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
    }
  }
  return [...edgeUses.values()].every((uses) => uses === 2);
};

const signedMeshVolume = (part) => part.triangles.reduce((volume, triangle) => {
  const [aIndex, bIndex, cIndex] = triangle;
  const a = part.vertices[aIndex];
  const b = part.vertices[bIndex];
  const c = part.vertices[cIndex];
  return volume + (
    a[0] * (b[1] * c[2] - b[2] * c[1]) +
    a[1] * (b[2] * c[0] - b[0] * c[2]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  ) / 6;
}, 0);

test("opaque mill shells and roofs face outward instead of disappearing as transparent", () => {
  const meshes = [
    deKatObject,
    oudegeinWipmolenObject,
    jongeSchaapSawmillObject,
    gekroondePoelenburgPaltrokObject,
  ].flatMap(({ parts }) => parts.filter(({ kind }) => kind === "mesh"));

  for (const part of meshes.filter((mesh) => mesh.doubleSided === false && meshIsClosed(mesh))) {
    assert.ok(signedMeshVolume(part) > 0, `${part.id} has inward-facing opaque shell triangles`);
  }

  for (const part of meshes.filter((mesh) => mesh.material === "roof" && !meshIsClosed(mesh))) {
    const upwardAreaVector = part.triangles.reduce(
      (sum, triangle) => sum + triangleNormal(part, triangle)[1],
      0,
    );
    assert.ok(upwardAreaVector > 0, `${part.id} roof faces inward/downward`);
  }
});

test("mesh adapter normalises final vertices without changing topology", () => {
  const source = deKatObject.parts.find(({ kind }) => kind === "mesh");
  assert.equal(source.kind, "mesh");
  const adapted = canonicalPartToPrefabPiece(source);
  assert.equal(adapted.visualMesh.indices.length, source.triangles.length * 3);
  for (const vertex of adapted.visualMesh.vertices) {
    assert.ok(vertex.every((value) => value >= -0.500001 && value <= 0.500001));
  }
  assert.equal(adapted.voxelization.mode, "shell");
});

test("rotated beams receive reconstructed axis-aligned contact envelopes", () => {
  const source = deKatObject.parts.find((part) => part.kind === "beam" && Math.abs(part.from[0] - part.to[0]) > 0.1 && Math.abs(part.from[1] - part.to[1]) > 0.1);
  assert.equal(source.kind, "beam");
  const adapted = canonicalPartToPrefabPiece(source);
  assert.equal(adapted.contactBoxes.length, 1);
  assert.ok(adapted.contactBoxes[0].size.every((value) => value > 0));
  assert.ok(Math.abs(Math.hypot(...source.to.map((value, axis) => value - source.from[axis])) - adapted.size[1]) < 1e-9);
});
