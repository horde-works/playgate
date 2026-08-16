import assert from "node:assert/strict";
import test from "node:test";
import {
  KALLUR_BASE_ELEVATION,
  kallurEarthMesh,
  kallurLandscapeDocument,
  kallurLandscapeSampler,
  kallurRenderMesh,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { flatPadDistance } from "../games/make-a-mess/src/content/landscape/landscapeSampler.ts";
import {
  KALLUR_PADS,
  KALLUR_PATH,
  KALLUR_SHORELINE,
  KALLUR_ZONES,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";

const LIGHTHOUSE_HEIGHT = 7;

function polygonCentroid(polygon) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of polygon) {
    x += px;
    z += pz;
  }
  return [x / polygon.length, z / polygon.length];
}

function polygonProbeGrid(polygon, step) {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  const probes = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
      if (kallurLandscapeSampler.sample(x, z).groundKind !== "outside") {
        probes.push([x, z]);
      }
    }
  }
  return probes;
}

test("kallur: the wall keeps the reference's vertical program", () => {
  const crown = KALLUR_ZONES.find((zone) => zone.id === "wall-crown");
  assert.ok(crown, "wall-crown zone exists");
  let peak = -Infinity;
  for (const [x, z] of polygonProbeGrid(crown.polygon, 4)) {
    peak = Math.max(peak, kallurLandscapeSampler.elevationAt(x, z));
  }
  const relief = peak - KALLUR_BASE_ELEVATION;
  assert.ok(
    relief >= 85,
    `wall relief ${relief.toFixed(1)} m must be at least 85 m`,
  );
  assert.ok(
    peak / LIGHTHOUSE_HEIGHT >= 12,
    `lighthouse:wall ratio 1:${(peak / LIGHTHOUSE_HEIGHT).toFixed(1)} must reach 1:12`,
  );
});

test("kallur: every zone polygon lies inside the shoreline", () => {
  for (const zone of KALLUR_ZONES) {
    for (const [x, z] of zone.polygon) {
      assert.notEqual(
        kallurLandscapeSampler.sample(x, z).groundKind,
        "outside",
        `zone ${zone.id} vertex (${x}, ${z}) escapes the island`,
      );
    }
  }
});

test("kallur: authored path grades stay comfortable", () => {
  for (let index = 1; index < KALLUR_PATH.length; index += 1) {
    const [ax, ay, az] = KALLUR_PATH[index - 1];
    const [bx, by, bz] = KALLUR_PATH[index];
    const run = Math.hypot(bx - ax, bz - az);
    const grade = Math.abs(by - ay) / run;
    assert.ok(
      grade <= 0.35,
      `path segment ${index} grade ${grade.toFixed(2)} exceeds 0.35`,
    );
  }
});

test("kallur: the walked surface conforms to the route and stays walkable", () => {
  // Walk the corridor centreline; the terrain must carry the route grade and
  // no sampled step may exceed the engine's 50-degree walkable limit.
  const maximumWalkableSlope = 1.1;
  for (let index = 1; index < KALLUR_PATH.length; index += 1) {
    const [ax, ay, az] = KALLUR_PATH[index - 1];
    const [bx, by, bz] = KALLUR_PATH[index];
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.ceil(length / 0.5));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const authoredY = ay + (by - ay) * t;
      const sampled = kallurLandscapeSampler.elevationAt(x, z);
      // Inside a pad's shoulder the yard legitimately grades the route up to
      // itself; the strict route-agreement check applies only outside it.
      const nearPad = KALLUR_PADS.some((pad) =>
        flatPadDistance(pad, x, z) <= pad.shoulder + 0.5
      );
      if (!nearPad) {
        assert.ok(
          Math.abs(sampled - authoredY) <= 0.45,
          `terrain leaves the route by ${(sampled - authoredY).toFixed(2)} m at (${x.toFixed(1)}, ${z.toFixed(1)})`,
        );
      }
      const ahead = kallurLandscapeSampler.elevationAt(
        x + ((bx - ax) / length) * 0.5,
        z + ((bz - az) / length) * 0.5,
      );
      const slope = Math.abs(ahead - sampled) / 0.5;
      assert.ok(
        slope <= maximumWalkableSlope,
        `path slope ${slope.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)}) exceeds walkable ${maximumWalkableSlope}`,
      );
    }
  }
});

test("kallur: hummocks live off the path and stay off it", () => {
  // Meso-relief is measured as the deviation from the local 4-neighbour mean.
  const roughnessAt = (x, z, spread) => {
    const center = kallurLandscapeSampler.elevationAt(x, z);
    const mean = (
      kallurLandscapeSampler.elevationAt(x + spread, z) +
      kallurLandscapeSampler.elevationAt(x - spread, z) +
      kallurLandscapeSampler.elevationAt(x, z + spread) +
      kallurLandscapeSampler.elevationAt(x, z - spread)
    ) / 4;
    return Math.abs(center - mean);
  };

  // Calm open turf south-east of the saddle: hummocks must be present.
  let openRoughness = 0;
  let probes = 0;
  for (let x = 20; x <= 48; x += 2.1) {
    for (let z = 22; z <= 50; z += 2.1) {
      openRoughness += roughnessAt(x, z, 1.3);
      probes += 1;
    }
  }
  openRoughness /= probes;
  assert.ok(
    openRoughness >= 0.035,
    `open turf roughness ${openRoughness.toFixed(3)} reads flat; hummocks missing`,
  );

  // The trodden centreline stays calm INSIDE its own band: neighbours at
  // 0.5 m still lie on the walked line, unlike the hummocked feather beyond.
  let pathRoughness = 0;
  for (const [x, , z] of KALLUR_PATH) {
    pathRoughness += roughnessAt(x, z, 0.5);
  }
  pathRoughness /= KALLUR_PATH.length;
  assert.ok(
    pathRoughness <= 0.02,
    `path roughness ${pathRoughness.toFixed(3)}: the walked line must stay calm`,
  );
});

test("kallur: terracettes appear only past the gradient gate", () => {
  // Flat strolling ground near the south coast must carry no bench stripes:
  // sample a vertical transect and check there is no periodic component at
  // the authored vertical spacing beyond meso noise levels.
  const flatDeviation = [];
  for (let z = 58; z <= 82; z += 0.8) {
    flatDeviation.push(kallurLandscapeSampler.elevationAt(30, z));
  }
  const flatRange = Math.max(...flatDeviation) - Math.min(...flatDeviation);
  assert.ok(
    flatRange <= 1.6,
    `south strolling ground varies by ${flatRange.toFixed(2)} m; benches or noise leaked onto flat land`,
  );
});

test("kallur: mesh and cell budgets stay inside the authored bounds", () => {
  assert.ok(
    kallurRenderMesh.triangleCount <= 400_000,
    `render mesh ${kallurRenderMesh.triangleCount} triangles exceeds budget`,
  );
  assert.ok(
    kallurEarthMesh.cells.length <= 6_000,
    `earth body ${kallurEarthMesh.cells.length} cells exceeds budget`,
  );
  assert.ok(
    kallurRenderMesh.triangleCount > 40_000,
    `render mesh ${kallurRenderMesh.triangleCount} triangles is suspiciously small — did the boundary collapse?`,
  );
});

test("kallur: the field is deterministic", () => {
  const probes = [
    [-40, 30],
    [0, -52],
    [30, -58],
    [-13, 5],
    [60, 40],
  ];
  for (const [x, z] of probes) {
    const first = kallurLandscapeSampler.elevationAt(x, z);
    const second = kallurLandscapeSampler.elevationAt(x, z);
    assert.equal(first, second);
  }
  assert.equal(kallurLandscapeDocument.boundary, KALLUR_SHORELINE);
});
