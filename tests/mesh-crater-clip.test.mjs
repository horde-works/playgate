import assert from "node:assert/strict";
import test from "node:test";

import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import {
  clipMeshAgainstCraters,
  clipPieceVisualMesh,
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

test("нормали и цвета переживают подрезку", () => {
  const normals = PLATE_VERTICES.map(() => [0, 1, 0]);
  const colors = PLATE_VERTICES.map((_, index) =>
    index < 2 ? [1, 0, 0] : [0, 0, 1],
  );
  const clipped = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
    { normals, colors },
  );
  assert.equal(clipped.normals?.length, clipped.vertices.length);
  assert.equal(clipped.colors?.length, clipped.vertices.length);
  // Плита плоская — все перенесённые нормали обязаны остаться её нормалью.
  for (const normal of clipped.normals) {
    assert.ok(Math.abs(normal[1] - 1) < 1e-9 && Math.abs(normal[0]) < 1e-9);
  }
  // Цвет по вершинам интерполируется, а не берётся от одной из них.
  const reds = clipped.colors.filter((color) => color[0] > 0.9).length;
  const blues = clipped.colors.filter((color) => color[2] > 0.9).length;
  const mixed = clipped.colors.length - reds - blues;
  assert.ok(mixed > 0, "середины рёбер обязаны получить смешанный цвет");
});

test("сетка без пер-вершинных данных их и не выдумывает", () => {
  const clipped = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
  );
  assert.equal(clipped.normals, undefined);
  assert.equal(clipped.colors, undefined);
});

test("подрезка живёт в системе куска и возвращается нормированной", () => {
  // Ровно тот путь, которым идёт carveAt: кратер в метрах от центра куска,
  // сетка нормирована на габарит, обратно — тоже нормированная.
  const hull = combatHexacopterRangeScene.breakablePieces.find(
    (piece) =>
      piece.id === "combat-hexacopter-range:vehicle:armoured-body-shell:piece",
  );
  const scaled = hull.visualMesh.vertices.map(([x, y, z]) => [
    x * hull.size[0],
    y * hull.size[1],
    z * hull.size[2],
  ]);
  const target = scaled[Math.floor(scaled.length / 2)];
  const clipped = clipMeshAgainstCraters(
    scaled,
    hull.visualMesh.indices,
    [{ center: target, radius: 0.45 }],
    { normals: hull.visualMesh.normals, colors: hull.visualMesh.colors },
  );
  assert.ok(clipped.removedTriangles > 0);

  const normalized = clipped.vertices.map(([x, y, z]) => [
    x / hull.size[0],
    y / hull.size[1],
    z / hull.size[2],
  ]);
  // Габарит куска не изменился: подрезка ничего не выносит за его рамку.
  for (const vertex of normalized) {
    for (const axis of [0, 1, 2]) {
      assert.ok(
        Math.abs(vertex[axis]) <= 0.5 + 1e-6,
        `вершина вышла за габарит куска: ${vertex[axis]}`,
      );
    }
  }
  // Авторские нормали дожили до конца: без них корпус стал бы фасеточным.
  assert.ok(hull.visualMesh.normals ? clipped.normals !== undefined : true);
});

test("кромка дыры получает торец в толщину материала", () => {
  const thickness = 0.045;
  const plain = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
  );
  const rimmed = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
    { rimThickness: thickness },
  );
  assert.ok(
    rimmed.indices.length > plain.indices.length,
    "борт обязан добавить треугольников",
  );

  // Плита лежит в плоскости y = 0; борт обязан выйти из неё ровно на половину
  // толщины в каждую сторону — авторская сетка описывает СРЕДИННУЮ плоскость.
  const heights = rimmed.vertices.map((vertex) => vertex[1]);
  const top = Math.max(...heights);
  const bottom = Math.min(...heights);
  assert.ok(Math.abs(top - thickness / 2) < 1e-9, `верх борта ${top}`);
  assert.ok(Math.abs(bottom + thickness / 2) < 1e-9, `низ борта ${bottom}`);

  // Борт стоит ТОЛЬКО у дыры: наружный контур плиты остаётся плоским.
  const outerRaised = rimmed.vertices.filter(
    (vertex) => Math.abs(vertex[1]) > 1e-9 && Math.hypot(vertex[0], vertex[2]) > 0.6,
  );
  assert.equal(outerRaised.length, 0, "наружный контур борта не получает");
});

test("без толщины в паспорте борт не строится", () => {
  const withoutRim = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
    { rimThickness: 0 },
  );
  for (const vertex of withoutRim.vertices) {
    assert.equal(vertex[1], 0);
  }
});

test("борт не ломает пер-вершинные данные", () => {
  const normals = PLATE_VERTICES.map(() => [0, 1, 0]);
  const colors = PLATE_VERTICES.map(() => [0.5, 0.5, 0.5]);
  const rimmed = clipMeshAgainstCraters(
    PLATE_VERTICES,
    PLATE_INDICES,
    [{ center: [0, 0, 0], radius: 0.4 }],
    { normals, colors, rimThickness: 0.045 },
  );
  assert.equal(rimmed.normals?.length, rimmed.vertices.length);
  assert.equal(rimmed.colors?.length, rimmed.vertices.length);
});

test("пробитый кусок всегда двусторонний", () => {
  // Колпак мельницы — замкнутая ОДНОсторонняя оболочка: пока дыр нет, изнанку
  // рисовать незачем. Дыра ровно это и меняет — через неё видно изнанку
  // дальней стенки, и без переключения постройка читается прозрачной насквозь.
  const cap = dutchPolderScene.breakablePieces.find((piece) =>
    piece.id.endsWith("m1:cap-hull"),
  );
  assert.ok(cap?.visualMesh, "колпак обязан быть сеточным");
  assert.equal(cap.visualMesh.doubleSided, false, "паспорт колпака изменился");

  const vertex = cap.visualMesh.vertices[0];
  const clipped = clipPieceVisualMesh(cap, [
    {
      center: [
        vertex[0] * cap.size[0],
        vertex[1] * cap.size[1],
        vertex[2] * cap.size[2],
      ],
      radius: 0.5,
    },
  ]);
  assert.ok(clipped);
  assert.equal(clipped.doubleSided, true);
  // Наружу кусок может выйти только на борт дыры — половину толщины
  // материала, и то лишь если дыра пришлась на самую кромку детали.
  const half = cap.voxelization.thickness / 2;
  for (const point of clipped.vertices) {
    for (const axis of [0, 1, 2]) {
      const overhang =
        (Math.abs(point[axis]) - 0.5) * cap.size[axis];
      assert.ok(
        overhang <= half + 1e-6,
        `кусок вырос на ${overhang.toFixed(4)} м при толщине ${cap.voxelization.thickness}`,
      );
    }
  }
});

test("борт колпака встаёт по толщине из паспорта", () => {
  const cap = dutchPolderScene.breakablePieces.find((piece) =>
    piece.id.endsWith("m1:cap-hull"),
  );
  const vertex = cap.visualMesh.vertices[0];
  const crater = {
    center: [
      vertex[0] * cap.size[0],
      vertex[1] * cap.size[1],
      vertex[2] * cap.size[2],
    ],
    radius: 0.5,
  };
  const withRim = clipPieceVisualMesh(cap, [crater]);
  const withoutRim = clipPieceVisualMesh(
    { ...cap, voxelization: { thickness: 0 } },
    [crater],
  );
  assert.ok(
    withRim.indices.length > withoutRim.indices.length,
    "борт обязан добавить треугольников и на замкнутой оболочке",
  );
});

test("кусок без авторской сетки подрезать нечем", () => {
  assert.equal(clipPieceVisualMesh({ size: [1, 1, 1] }, []), null);
});
