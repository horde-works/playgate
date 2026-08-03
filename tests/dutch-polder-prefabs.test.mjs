import assert from "node:assert/strict";
import test from "node:test";
import { deKatObject } from "../games/make-a-mess/src/content/objects/dutchWindmills/deKatObject.ts";
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
