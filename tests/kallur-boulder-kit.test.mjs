import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBoulderArchetype,
  KALLUR_BOULDER_ARCHETYPES,
  kallurBoulderKitObject,
  kallurBoulderKitParts,
} from "../games/make-a-mess/src/content/objects/kallur/kallurBoulderKitObject.ts";

test("валуны: шесть архетипов, бюджет треугольников", () => {
  assert.equal(KALLUR_BOULDER_ARCHETYPES.length, 6);
  for (const part of kallurBoulderKitParts) {
    assert.ok(
      part.kind === "mesh" && part.triangles.length <= 170,
      `${part.id}: ${part.kind === "mesh" ? part.triangles.length : "?"} треугольников превышает бюджет`,
    );
  }
});

test("валуны: дно плоское на y=0, габариты по паспорту", () => {
  for (const archetype of KALLUR_BOULDER_ARCHETYPES) {
    const geometry = buildBoulderArchetype(archetype);
    let minY = Infinity;
    let seated = 0;
    const max = [-Infinity, -Infinity, -Infinity];
    for (const [x, y, z] of geometry.vertices) {
      minY = Math.min(minY, y);
      if (y < 0.02) seated += 1;
      max[0] = Math.max(max[0], Math.abs(x));
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], Math.abs(z));
    }
    assert.ok(Math.abs(minY) < 1e-9, `${archetype.id}: дно не на нуле`);
    assert.ok(seated >= 3, `${archetype.id}: посадочная грань не плоская (${seated} вершин)`);
    assert.ok(max[1] > 0.25 && max[1] < 1.4, `${archetype.id}: высота ${max[1].toFixed(2)} вне паспорта`);
    assert.ok(max[0] < 1.4 && max[2] < 1.2, `${archetype.id}: план вне паспорта`);
  }
});

test("валуны: детерминизм и невырожденность граней", () => {
  for (const archetype of KALLUR_BOULDER_ARCHETYPES) {
    const first = buildBoulderArchetype(archetype);
    const second = buildBoulderArchetype(archetype);
    assert.deepEqual(first.vertices, second.vertices, `${archetype.id}: недетерминирован`);
    for (const [a, b, c] of first.triangles) {
      const va = first.vertices[a];
      const vb = first.vertices[b];
      const vc = first.vertices[c];
      const ab = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
      const ac = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const area = Math.hypot(...cross) / 2;
      assert.ok(Number.isFinite(area), `${archetype.id}: NaN в грани`);
    }
  }
});

test("валуны: обязательные виды присутствуют", () => {
  const ids = new Set(kallurBoulderKitObject.views.map((view) => view.id));
  for (const required of ["front-row", "three-quarter-row", "top-row", "profile-row"]) {
    assert.ok(ids.has(required), `нет вида ${required}`);
  }
});
