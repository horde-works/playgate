import assert from "node:assert/strict";
import test from "node:test";
import {
  dc3AirframeSurface,
  dc3BlockoutObject,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";

function bodyVerts(part) {
  return part.vertices.map((vertex) => dc3AirframeSurface.worldToBody(vertex));
}

function centroid(part) {
  const verts = bodyVerts(part);
  const n = verts.length;
  return [0, 1, 2].map((axis) =>
    verts.reduce((sum, vertex) => sum + vertex[axis], 0) / n);
}

test("four rounded cabin-entry overlays sit on both sides, not in the greenhouse", () => {
  const leaves = dc3BlockoutObject.parts.filter(
    (part) => part.group === "cabin-entry-overlay" && part.id.endsWith(":board:0"),
  );
  assert.equal(leaves.length, 4, `створок ${leaves.length}`);
  assert.equal(
    dc3AirframeSurface.cabinEntries.length,
    2,
    "план держит переднюю и заднюю станции",
  );

  const lastWindow = dc3AirframeSurface.windows[dc3AirframeSurface.windows.length - 1];
  const firstWindow = dc3AirframeSurface.windows[0];
  const greenhouseAft = dc3AirframeSurface.sideLightBay.zAft;

  for (const plan of dc3AirframeSurface.cabinEntries) {
    for (const side of ["left", "right"]) {
      const leaf = leaves.find((part) => part.id === `cabin-entry-${side}-${plan.id}:board:0`);
      assert.ok(leaf, `нет створки ${side} ${plan.id}`);
      const [cx, , cz] = centroid(leaf);
      assert.equal(Math.sign(cx), side === "right" ? 1 : -1, leaf.id);
      assert.ok(
        Math.abs(cz - plan.z) < 0.08,
        `${leaf.id} стоит на z=${cz.toFixed(2)}, план ${plan.z}`,
      );
      const zs = bodyVerts(leaf).map((vertex) => vertex[2]);
      const zMin = Math.min(...zs);
      const zMax = Math.max(...zs);
      assert.ok(zMax < greenhouseAft - 0.02, `${leaf.id} залезла в фонарь`);
      if (plan.id === "forward") {
        assert.ok(
          zMin > firstWindow.z + firstWindow.along / 2 + 0.5,
          `${leaf.id} слишком близко к первому окну`,
        );
      } else {
        assert.ok(zMin < lastWindow.z && zMax > lastWindow.z, `${leaf.id} мимо последнего окна`);
      }

      const yCentre = plan.floorY + plan.height / 2;
      const atEnd = bodyVerts(leaf).filter(
        (vertex) => Math.abs(vertex[2] - plan.z) > plan.width / 2 - 0.05,
      );
      assert.ok(atEnd.length > 4, `${leaf.id}: нет кромки по z`);
      const maxDy = Math.max(...atEnd.map((vertex) => Math.abs(vertex[1] - yCentre)));
      assert.ok(
        maxDy < plan.height / 2 - plan.cornerRadius + 0.08,
        `${leaf.id}: угол острый, полувысота на торце ${maxDy.toFixed(2)}`,
      );
    }
  }

  assert.equal(
    dc3AirframeParts().filter((part) => part.group === "cabin-entry-overlay").length,
    16,
    "накладки должны доехать до мира вместе с панельной шкурой",
  );
  assert.ok(
    dc3BlockoutObject.views.some((view) => view.id === "entry-forward-right"),
    "нет кадра передней створки",
  );
});

test("the entry seal is a closed ring with a gap around the leaf", () => {
  const hasEdge = (triangles, a, b) =>
    triangles.some((triangle) => triangle.includes(a) && triangle.includes(b));

  for (const plan of dc3AirframeSurface.cabinEntries) {
    for (const side of ["left", "right"]) {
      const prefix = `cabin-entry-${side}-${plan.id}`;
      const leaf = dc3BlockoutObject.parts.find((part) => part.id === `${prefix}:board:0`);
      const seal = dc3BlockoutObject.parts.find((part) => part.id === `${prefix}-seal`);
      const frame = dc3BlockoutObject.parts.find((part) => part.id === `${prefix}-frame`);
      assert.ok(leaf && seal && frame, prefix);

      const cols = frame.vertices.length / 4;
      assert.ok(
        hasEdge(frame.triangles, 0, cols - 1),
        `${frame.id}: гермообвод не замкнут на стыке кольца`,
      );
      assert.ok(
        hasEdge(seal.triangles, 0, cols - 1),
        `${seal.id}: лента герметика не замкнута`,
      );

      const yCentre = plan.floorY + plan.height / 2;
      const nearCrown = (part) =>
        bodyVerts(part).filter((vertex) =>
          Math.abs(vertex[2] - plan.z) < 0.08 && vertex[1] > yCentre);
      const leafTop = Math.max(...nearCrown(leaf).map((vertex) => vertex[1]));
      const sealInner = bodyVerts(seal).slice(0, seal.vertices.length / 4);
      const sealTop = Math.max(
        ...sealInner
          .filter((vertex) => Math.abs(vertex[2] - plan.z) < 0.08)
          .map((vertex) => vertex[1]),
      );
      assert.ok(
        sealTop - leafTop > plan.sealReveal * 0.5,
        `${prefix}: щели нет, гермообвод сидит на кромке створки`,
      );
    }
  }
});

test("leaf and pane share a plug-slide id, seal and frame stay on the fuselage", () => {
  for (const plan of dc3AirframeSurface.cabinEntries) {
    for (const side of ["left", "right"]) {
      const prefix = `cabin-entry-${side}-${plan.id}`;
      const ids = dc3BlockoutObject.parts
        .filter((part) => part.group === "cabin-entry-overlay" && part.id.startsWith(prefix))
        .map((part) => part.id)
        .sort();
      assert.deepEqual(ids, [
        `${prefix}-frame`,
        `${prefix}-seal`,
        `${prefix}:board:0`,
        `${prefix}:board:1`,
      ]);
    }
  }
});
