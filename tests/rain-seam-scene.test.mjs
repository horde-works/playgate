import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Euler, Matrix4, Vector3 } from "three";
import {
  rainSeamDocument,
  rainSeamGroundKindAt,
} from "../games/make-a-mess/src/content/scenes/rainSeamDocument.ts";
import {
  rainSeamSurfaceAreas,
  rainSeamSurfaceRoutes,
} from "../games/make-a-mess/src/content/scenes/rainSeamPlan.ts";
import {
  rainSeamCompilation,
  rainSeamScene,
} from "../games/make-a-mess/src/game/rainSeamScene.ts";

test("Zadvorki is stable before the player touches it", () => {
  const unsupported = rainSeamScene.resolveStructuralCollapse(new Set());

  assert.equal(rainSeamScene.breakablePieces.length > 8_000, true);
  assert.equal(rainSeamScene.lampDefinitions.length >= 6, true);
  assert.equal(rainSeamScene.worldRadius, 60);
  assert.equal(unsupported.size, 0);
});

test("the backyards are a serializable document compiled from reusable prefabs", () => {
  const parsed = JSON.parse(JSON.stringify(rainSeamDocument));

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.id, "rain-seam");
  assert.equal(parsed.title.includes("Задворки"), true);
  assert.equal(rainSeamCompilation.artifact.objectCount > 5_000, true);
  assert.equal(rainSeamCompilation.artifact.prefabIds.length >= 24, true);
  assert.equal(rainSeamCompilation.artifact.groupCount, 14);
});

test("the photographed street details are actual scene pieces", () => {
  const ids = rainSeamScene.breakablePieces.map((piece) => piece.id);

  for (const signature of [
    // Киоск стройматериалов торгует прямо на улицу.
    ":kiosk:lightbox",
    ":kiosk:qr-code",
    ":kiosk:tar-plinth:front",
    ":kiosk:gas:run",
    ":kiosk-brooms:head:",
    ":board:north:panel:",
    // Двор: газовая нить, бельё, техника детей, заплата на крыше.
    ":gas-line:yard-span",
    ":clothesline:laundry:",
    ":scooter:deck",
    ":bike:blue:wheel:",
    ":shed-roof-patch:",
    ":outbuilding:tile-patch",
    // Частник: гирлянда под навесом.
    ":carport:string:bulb:",
    // Город подступает: башни, вывеска, саженцы на свежей плитке.
    ":tower:stone:front:",
    ":shop-sign:",
    ":sapling:0:",
    ":front-line:gate:pillar:",
    ":flower-bed:flower:",
  ]) {
    assert.equal(ids.some((id) => id.includes(signature)), true, signature);
  }
});

test("ground narrates the routes: mud, gravel, worn grass and fresh pavers", () => {
  assert.equal(rainSeamGroundKindAt(0, 50), "gravel", "spawn approach");
  assert.equal(rainSeamGroundKindAt(0, 43), "asphalt", "broken street");
  assert.equal(rainSeamGroundKindAt(-8, 43), "soil", "kiosk mud apron");
  assert.equal(rainSeamGroundKindAt(12, 45), "grass", "private plot lawn");
  assert.equal(rainSeamGroundKindAt(0, 37.5), "gravel", "gate threshold");
  assert.equal(rainSeamGroundKindAt(0.5, 28), "grass", "lane centre strip");
  assert.equal(rainSeamGroundKindAt(-1, 28), "gravel", "lane wheel track");
  assert.equal(rainSeamGroundKindAt(0, 0), "soil", "compacted courtyard");
  assert.equal(rainSeamGroundKindAt(-10, 5), "grass", "garden strip");
  assert.equal(rainSeamGroundKindAt(0, -32), "soil", "construction strip");
  assert.equal(rainSeamGroundKindAt(0, -45), "gray-pavers", "fresh tower pavers");
});

test("dirt and retained rainwater are masks on the destructible city surface", () => {
  const landscape = rainSeamScene.breakablePieces.filter(
    (piece) => piece.landscapeSurface === "city-ground",
  );

  assert.equal(landscape.length > 1_500, true);
  assert.equal(landscape.every((piece) => piece.shape === "groundTile"), true);
  assert.equal(rainSeamSurfaceRoutes.some((route) => route.dirt > 0.9), true);
  assert.equal(rainSeamSurfaceRoutes.some((route) => route.wetness > 0.8), true);
  assert.equal(rainSeamSurfaceAreas.some((area) => area.dirt > 0.9), true);
  assert.equal(rainSeamSurfaceAreas.some((area) => area.wetness > 0.65), true);
});

// ---------------------------------------------------------------------------
// Дисциплина сборки: никакие два объекта сцены не взаимопроникают. Кроны,
// ткань и терраин исключены; перекладина на столбе и заплата на скате —
// осознанные примыкания.
// ---------------------------------------------------------------------------

const INTENTIONAL_PAIRS = new Set([
  "rain-seam:street-life:power-crossarm <-> rain-seam:street-life:power-pole",
  "rain-seam:courtyard-houses:outbuilding <-> rain-seam:courtyard-houses:shed-roof-patch",
  // Газовый отвод специально входит сквозь стену дома — труба питает его.
  "rain-seam:courtyard-houses:house-side <-> rain-seam:gas-line:side-inlet",
]);

function instanceOf(pieceId) {
  return pieceId.split(":").slice(0, 3).join(":");
}

function pieceBox(piece) {
  const box = new Box3(
    new Vector3(-piece.size[0] / 2, -piece.size[1] / 2, -piece.size[2] / 2),
    new Vector3(piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2),
  );
  const rotation = piece.rotation ?? [0, 0, 0];
  const matrix = new Matrix4()
    .makeRotationFromEuler(new Euler(rotation[0], rotation[1], rotation[2]))
    .setPosition(piece.position[0], piece.position[1], piece.position[2]);
  return box.applyMatrix4(matrix);
}

// ---------------------------------------------------------------------------
// Проходимость: игрок (капсула 0.64×1.3 с перешагиванием до 0.35) должен
// пройти маршрут улица → ворота → проулок → двор → сарай и подняться по
// лестнице главного дома. Двери на петлях и ткань проходимы по определению.
// ---------------------------------------------------------------------------

function passabilityEntries() {
  const skip = (piece) =>
    piece.id.includes(":terrain-") ||
    piece.id.includes(":courtyard-border:") ||
    piece.material === "foliage" ||
    piece.material === "cloth" ||
    piece.hinge !== undefined;
  return rainSeamScene.breakablePieces
    .filter((piece) => !skip(piece))
    .map((piece) => ({ id: piece.id, box: pieceBox(piece) }));
}

function obstructionsAt(entries, x, z, footY, allow = []) {
  const min = new Vector3(x - 0.32, footY + 0.35, z - 0.32);
  const max = new Vector3(x + 0.32, footY + 1.65, z + 0.32);
  return entries
    .filter(({ id, box }) =>
      box.max.x > min.x && box.min.x < max.x &&
      box.max.y > min.y && box.min.y < max.y &&
      box.max.z > min.z && box.min.z < max.z &&
      !allow.some((fragment) => id.includes(fragment)))
    .map(({ id }) => id);
}

test("the walk from the street to the shed door is unobstructed", () => {
  const entries = passabilityEntries();
  const route = [
    [0.8, 50], [0.5, 44], [-0.9, 38.5], [-0.8, 36], [-0.6, 32], [-0.2, 26],
    [0.6, 23.4], [0.9, 21.5], [0, 16], [-1.5, 8], [-2.6, 0], [-3.6, -8],
    [-3.2, -14], [-2.6, -16.8],
  ];
  const violations = new Set();
  for (let leg = 1; leg < route.length; leg += 1) {
    const [x0, z0] = route[leg - 1];
    const [x1, z1] = route[leg];
    const stepCount = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6));
    for (let step = 0; step <= stepCount; step += 1) {
      const t = step / stepCount;
      for (const id of obstructionsAt(entries, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.04)) {
        violations.add(id);
      }
    }
  }
  assert.deepEqual([...violations].sort(), []);
});

test("every ground-floor doorway has a clear hall behind it", () => {
  const entries = passabilityEntries();
  // Точка в метре за каждой входной дверью, на полу этого дома.
  const halls = [
    ["house-main", 9.9, 27.8, 0.62],
    ["house-side", 12.97, 10.35, 0.62],
    ["private-house", 12.95, 48.25, 0.62],
    ["shed", -2.45, -19.1, 0.3],
  ];
  const violations = new Set();
  for (const [label, x, z, footY] of halls) {
    for (const id of obstructionsAt(entries, x, z, footY)) {
      violations.add(`${label}: ${id}`);
    }
  }
  assert.deepEqual([...violations].sort(), []);
});

test("the staircase of the main house can be climbed", () => {
  const entries = passabilityEntries();
  const steps = rainSeamScene.breakablePieces.filter((piece) =>
    piece.id.includes(":house-main:stair:") && !piece.id.includes(":rail") && !piece.id.includes(":baluster"),
  );
  assert.equal(steps.length, 7);

  const violations = new Set();
  for (const step of steps) {
    const box = pieceBox(step);
    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    for (const id of obstructionsAt(entries, x, z, box.max.y, [":house-main:stair:"])) {
      violations.add(id);
    }
  }
  assert.deepEqual([...violations].sort(), []);
});

test("no two scene objects interpenetrate", () => {
  const CLEARANCE = 0.08;
  const skip = (piece) =>
    piece.id.includes(":terrain-") ||
    piece.id.includes(":courtyard-border:") ||
    piece.material === "foliage" ||
    piece.material === "cloth";

  const entries = rainSeamScene.breakablePieces
    .filter((piece) => !skip(piece))
    .map((piece) => ({ id: piece.id, box: pieceBox(piece) }));

  const violations = new Set();
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      const instanceA = instanceOf(a.id);
      const instanceB = instanceOf(b.id);
      if (instanceA === instanceB) {
        continue;
      }
      const overlapX = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
      const overlapY = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
      const overlapZ = Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z);
      if (overlapX > CLEARANCE && overlapY > CLEARANCE && overlapZ > CLEARANCE) {
        const key = [instanceA, instanceB].sort().join(" <-> ");
        if (!INTENTIONAL_PAIRS.has(key)) {
          violations.add(`${key} (${a.id} / ${b.id})`);
        }
      }
    }
  }

  assert.deepEqual([...violations].sort(), []);
});
