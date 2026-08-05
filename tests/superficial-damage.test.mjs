import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "three";

import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import {
  SUPERFICIAL_CARVE_FRACTION,
  compilePieceDamageGeometry,
  damageBody,
  isSuperficialCarve,
  pieceMaterialVolume,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";

const roof = dutchPolderScene.breakablePieces.find(
  (piece) => piece.id === "dutch-polder:houses:h2:main-roof-left",
);

/** Один удар по куску: ровно то, что делает carveAt перед своим решением. */
function hit(piece, radius, body, vertexIndex) {
  const compiled = compilePieceDamageGeometry(piece);
  const source = { ...piece, voxelBody: body ?? compiled.body, boxes: compiled.boxes };
  const vertex = piece.visualMesh.vertices[
    vertexIndex ?? Math.floor(piece.visualMesh.vertices.length / 2)
  ];
  const result = damageBody(
    source,
    {
      position: new Vector3(...piece.position),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: `probe:${radius}`,
      worldPoint: new Vector3(
        piece.position[0] + vertex[0] * piece.size[0],
        piece.position[1] + vertex[1] * piece.size[1],
        piece.position[2] + vertex[2] * piece.size[2],
      ),
      radius,
      burstSpeed: 0,
    },
  );
  return { result, source, cell: Math.max(...source.voxelBody.cellSize) };
}

function query(piece, shot, previouslyRemoved = 0) {
  return {
    radius: shot.radius,
    fragments: shot.result.fragments,
    sourceSize: piece.size,
    sourceCenter: piece.position,
    removedVolume: shot.result.removedVolume,
    previouslyRemoved,
    materialVolume: pieceMaterialVolume(piece),
    tolerance: shot.cell,
  };
}

test("пуля в кровлю оставляет её кровлей", () => {
  assert.ok(roof?.visualMesh);
  const shot = hit(roof, 0.19);
  assert.ok(shot.result, "пуля обязана снять материал");
  assert.equal(shot.result.fragments.length, 1);
  assert.equal(
    isSuperficialCarve({ ...query(roof, { ...shot, radius: 0.19 }) }),
    true,
    "форма не изменилась — представление меняться не должно",
  );
});

test("воронка ракеты обязана стать настоящей дырой", () => {
  const shot = hit(roof, 1.05);
  assert.ok(shot.result);
  assert.equal(
    isSuperficialCarve({ ...query(roof, { ...shot, radius: 1.05 }) }),
    false,
    "сквозь такую дыру видно, отметиной её рисовать нельзя",
  );
});

test("изрешечённый кусок перестаёт быть собой", () => {
  const shot = hit(roof, 0.19);
  const material = pieceMaterialVolume(roof);
  // Тот же самый удар, но по куску, из которого уже выбита допустимая доля.
  assert.equal(
    isSuperficialCarve({
      ...query(roof, { ...shot, radius: 0.19 }, material * SUPERFICIAL_CARVE_FRACTION),
    }),
    false,
  );
  assert.equal(
    isSuperficialCarve({
      ...query(roof, { ...shot, radius: 0.19 }, material * 0.01),
    }),
    true,
  );
});

test("раскол на части всегда меняет представление", () => {
  const shot = hit(roof, 0.19);
  assert.equal(
    isSuperficialCarve({
      ...query(roof, { ...shot, radius: 0.19 }),
      // Ядро вернуло два куска: это уже другая форма, и не одна.
      fragments: [shot.result.fragments[0], shot.result.fragments[0]],
    }),
    false,
  );
});

test("дыра, съевшая край, меняет представление", () => {
  const shot = hit(roof, 0.19);
  const shrunk = {
    ...shot.result.fragments[0],
    size: [
      shot.result.fragments[0].size[0] - shot.cell * 3,
      shot.result.fragments[0].size[1],
      shot.result.fragments[0].size[2],
    ],
  };
  assert.equal(
    isSuperficialCarve({
      ...query(roof, { ...shot, radius: 0.19 }),
      fragments: [shrunk],
    }),
    false,
    "обкусанная кромка на авторской сетке не видна — там она уже врёт",
  );
});

test("повреждение копится: вторая пуля работает по решётке первой", () => {
  const first = hit(roof, 0.19);
  const carried = first.result.fragments[0].voxelBody;
  assert.ok(carried, "поверхностный удар обязан отдать свою решётку дальше");
  const occupiedFirst = carried.occupied.reduce((sum, value) => sum + value, 0);

  // Вторая пуля в другое место кровли, но по ТОЙ ЖЕ решётке. Часть вершин
  // сетки на грубой решётке материала не задевает — берём первую попавшую.
  let second = null;
  for (let index = 0; index < roof.visualMesh.vertices.length && !second; index += 1) {
    const shot = hit(roof, 0.19, carried, index);
    if (shot.result && shot.result.removedVolume > 0) {
      second = shot;
    }
  }
  assert.ok(second, "второй удар обязан найти материал на накопленной решётке");

  const occupiedSecond = second.result.fragments[0].voxelBody.occupied.reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.ok(
    occupiedSecond < occupiedFirst,
    `материал обязан убывать от удара к удару: ${occupiedFirst} → ${occupiedSecond}`,
  );
});
