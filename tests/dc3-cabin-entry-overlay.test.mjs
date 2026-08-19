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
        assert.ok(
          zMax < lastWindow.z - lastWindow.along / 2 - 0.05,
          `${leaf.id} должна стоять за последним оставшимся окном, а не на нём`,
        );
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

test("the cabin-entry opening is clear of seats, frames and cage rails", () => {
  const { cabinEntries, cabinEntryHalfAcross, worldToBody } = dc3AirframeSurface;
  const inOpening = (vertex, plan, side, margin) => {
    const [x, y, z] = worldToBody(vertex);
    if (Math.sign(x) !== side && Math.abs(x) > 0.08) return false;
    const dz = z - plan.z;
    if (Math.abs(dz) > plan.width / 2 - margin) return false;
    const yCentre = plan.floorY + plan.height / 2;
    const halfY = cabinEntryHalfAcross(
      dz,
      plan.width / 2,
      plan.height / 2,
      plan.cornerRadius,
    );
    return Math.abs(y - yCentre) < halfY - margin;
  };
  const railCrossesOpening = (part, plan, side) => {
    if (!part.triangles) return false;
    for (const triangle of part.triangles) {
      const pts = triangle.map((index) => part.vertices[index]);
      const bodies = pts.map((vertex) => worldToBody(vertex));
      const zs = bodies.map((vertex) => vertex[2]);
      if (Math.min(...zs) > plan.z - 0.05 || Math.max(...zs) < plan.z + 0.05) continue;
      const centroid = [0, 1, 2].map((axis) =>
        (pts[0][axis] + pts[1][axis] + pts[2][axis]) / 3);
      if (inOpening(centroid, plan, side, 0.02)) return true;
    }
    return false;
  };
  const cornersOf = (part) => {
    if (part.vertices) return part.vertices;
    const [cx, cy, cz] = part.center;
    const [sx, sy, sz] = part.size;
    const corners = [];
    for (const dx of [-sx / 2, sx / 2]) {
      for (const dy of [-sy / 2, sy / 2]) {
        for (const dz of [-sz / 2, sz / 2]) corners.push([cx + dx, cy + dy, cz + dz]);
      }
    }
    return corners;
  };

  for (const plan of cabinEntries) {
    for (const side of [1, -1]) {
      const board = side > 0 ? "right" : "left";
      const cage = dc3BlockoutObject.parts.find(
        (part) => part.id === `cabin-entry-${board}-${plan.id}-cage`,
      );
      assert.ok(cage, `${board} ${plan.id}: no inner cage surround`);
      assert.equal(cage.group, "cabin-frame");

      for (const part of dc3BlockoutObject.parts) {
        if (part.id === cage.id) continue;
        if (part.group === "cabin-entry-overlay") continue;
        const blocking = /^(stringer-|longeron-|fuselage-frame-|cabin-frame-)/.test(part.id)
          || part.group === "cabin-seats";
        if (!blocking) continue;
        if (part.vertices) {
          assert.equal(
            railCrossesOpening(part, plan, side),
            false,
            `${part.id} still spans the ${board} ${plan.id} opening`,
          );
        }
        for (const vertex of cornersOf(part)) {
          assert.equal(
            inOpening(vertex, plan, side, 0.04),
            false,
            `${part.id} still occupies the ${board} ${plan.id} opening`,
          );
        }
      }
    }
  }
});
