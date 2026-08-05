import assert from "node:assert/strict";
import test from "node:test";

import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import {
  clipMeshAgainstCraters,
  meshPlanarDeviation,
} from "../games/make-a-mess/src/game/meshCraterClip.ts";

/** Квадратная плита 2×2 в плоскости XZ, разбитая на два треугольника. */
const PLATE_VERTICES = [
  [-1, 0, -1],
  [1, 0, -1],
  [1, 0, 1],
  [-1, 0, 1],
];
const PLATE_INDICES = [0, 1, 2, 0, 2, 3];

function area(mesh) {
  let total = 0;
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const a = mesh.vertices[mesh.indices[index]];
    const b = mesh.vertices[mesh.indices[index + 1]];
    const c = mesh.vertices[mesh.indices[index + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    total += 0.5 * Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    );
  }
  return total;
}

test("без кратеров сетка возвращается той же самой", () => {
  const clipped = clipMeshAgainstCraters(PLATE_VERTICES, PLATE_INDICES, []);
  assert.equal(clipped.vertices, PLATE_VERTICES);
  assert.equal(clipped.indices, PLATE_INDICES);
});

test("кратер вырезает в плите круг, а не квадрат", () => {
  const radius = 0.4;
  const expected = 4 - Math.PI * radius * radius;
  const measure = (subdivisions) =>
    area(
      clipMeshAgainstCraters(
        PLATE_VERTICES,
        PLATE_INDICES,
        [{ center: [0, 0, 0], radius }],
        { subdivisions },
      ),
    );

  // Точность — функция дробления, и она обязана сходиться: иначе «круглая
  // дыра» держится на удачно подобранном пороге, а не на самом методе.
  const coarse = Math.abs(measure(3) - expected) / expected;
  const fine = Math.abs(measure(5) - expected) / expected;
  assert.ok(coarse < 0.06, `на трёх уровнях ошибка ${(coarse * 100).toFixed(1)} %`);
  assert.ok(fine < 0.02, `на пяти уровнях ошибка ${(fine * 100).toFixed(1)} %`);
  assert.ok(fine < coarse, "дробление обязано улучшать кромку");

  // Кромка обязана лежать НА окружности удара: ни одна вершина не внутри.
  const clipped = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius }],
  );
  for (const vertex of clipped.vertices) {
    const distance = Math.hypot(vertex[0], vertex[2]);
    assert.ok(
      distance >= radius - 1e-6,
      `вершина внутри дыры: ${distance.toFixed(4)}`,
    );
  }
});

test("нетронутая часть плиты остаётся целыми треугольниками", () => {
  const clipped = clipMeshAgainstCraters(
    // Плита из четырёх треугольников: кратер задевает только один угол.
    [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 0, 0]],
    [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4],
    [{ center: [-1, 0, -1], radius: 0.3 }],
  );
  // Три из четырёх треугольников не встретили кратер и прошли как есть —
  // дробление стоит только там, где действительно есть дыра.
  assert.ok(
    clipped.indices.length / 3 < 40,
    `треугольников после подрезки ${clipped.indices.length / 3}`,
  );
  assert.ok(clipped.indices.length / 3 > 3);
});

test("кратер больше детали убирает её целиком", () => {
  const clipped = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 5 }],
  );
  assert.equal(clipped.indices.length, 0);
  assert.equal(clipped.removedTriangles, 2);
});

test("несколько попаданий дают несколько дыр", () => {
  const single = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [-0.5, 0, 0], radius: 0.25 }],
  );
  const double = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [
      { center: [-0.5, 0, 0], radius: 0.25 },
      { center: [0.5, 0, 0], radius: 0.25 },
    ],
  );
  assert.ok(
    area(double) < area(single),
    "вторая пробоина обязана снять ещё площади",
  );
  const expected = 4 - 2 * Math.PI * 0.25 * 0.25;
  assert.ok(Math.abs(area(double) - expected) < expected * 0.03);
});

test("плоская плита мельницы и кривая оболочка коптера различимы измерением", () => {
  // Полотно крыла мельницы — настоящая плоская плита сложного контура.
  const millPlate = dutchPolderScene.breakablePieces.find(
    (piece) => piece.id === "dutch-polder:m1-rotor:m1:rotor-0-canvas",
  );
  const hull = combatHexacopterRangeScene.breakablePieces.find(
    (piece) =>
      piece.id === "combat-hexacopter-range:vehicle:armoured-body-shell:piece",
  );
  const scaled = (piece) =>
    piece.visualMesh.vertices.map(([x, y, z]) => [
      x * piece.size[0],
      y * piece.size[1],
      z * piece.size[2],
    ]);

  const flat = meshPlanarDeviation(scaled(millPlate));
  const curved = meshPlanarDeviation(scaled(hull));
  assert.ok(flat < 0.02, `полотно отклоняется на ${flat.toFixed(3)} м`);
  assert.ok(curved > 0.2, `корпус отклоняется всего на ${curved.toFixed(3)} м`);
  // Смок той же мельницы — противоположный полюс той же шкалы.
  const smock = dutchPolderScene.breakablePieces.find(
    (piece) => piece.id === "dutch-polder:m1-fixed:m1:smock-shell",
  );
  assert.ok(meshPlanarDeviation(scaled(smock)) > 1);
});

test("пробоина в настоящем корпусе стоит десятков треугольников, а не пересборки", () => {
  const hull = combatHexacopterRangeScene.breakablePieces.find(
    (piece) =>
      piece.id === "combat-hexacopter-range:vehicle:armoured-body-shell:piece",
  );
  const vertices = hull.visualMesh.vertices.map(([x, y, z]) => [
    x * hull.size[0],
    y * hull.size[1],
    z * hull.size[2],
  ]);
  const before = hull.visualMesh.indices.length / 3;
  const target = vertices[Math.floor(vertices.length / 2)];
  const clipped = clipMeshAgainstCraters(
    vertices,
    hull.visualMesh.indices,
    [{ center: target, radius: 0.35 }],
  );
  const after = clipped.indices.length / 3;
  assert.ok(clipped.removedTriangles > 0, "пробоина обязана снять материал");
  assert.ok(
    after < before + 260,
    `сетка выросла с ${before} до ${after} треугольников`,
  );
});
