import assert from "node:assert/strict";
import test from "node:test";

import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { compilePieceDamageGeometry } from "../games/make-a-mess/src/game/destructionRuntime.ts";
import { shellPlateBoxes } from "../games/make-a-mess/src/game/shellPlates.ts";

const CELL = [0.1, 0.1, 0.1];

test("сплошное тело не трогается", () => {
  const boxes = [{ center: [0, 0, 0], size: [0.1, 0.1, 0.1] }];
  assert.equal(shellPlateBoxes(boxes, CELL, undefined), boxes);
  assert.equal(shellPlateBoxes(boxes, CELL, 1), boxes);
  assert.equal(shellPlateBoxes(boxes, undefined, 0.1), boxes);
});

test("оболочка сжимается только поперёк себя", () => {
  // Полоса вдоль поверхности: три клетки в длину, одна поперёк.
  const boxes = [{ center: [0, 0, 0], size: [0.3, 0.1, 0.5] }];
  const [plate] = shellPlateBoxes(boxes, CELL, 0.2);
  assert.equal(plate.size[0], 0.3, "длина вдоль поверхности не меняется");
  assert.equal(plate.size[2], 0.5, "ширина вдоль поверхности не меняется");
  assert.ok(Math.abs(plate.size[1] - 0.02) < 1e-9, `толщина ${plate.size[1]}`);
  assert.deepEqual(plate.center, [0, 0, 0], "плита обязана лечь на поверхность");
});

test("из нескольких тонких осей выбирается самая тонкая", () => {
  const boxes = [{ center: [0, 0, 0], size: [0.1, 0.06, 0.4] }];
  const [plate] = shellPlateBoxes(boxes, CELL, 0.25);
  assert.equal(plate.size[0], 0.1);
  assert.ok(Math.abs(plate.size[1] - 0.015) < 1e-9);
});

test("складка обшивки тоже становится плитой", () => {
  // Блок в несколько клетток толщиной у оболочки не монолит, а сошедшиеся
  // поверхности: кубом его рисовать нельзя.
  const boxes = [{ center: [0, 0, 0], size: [0.4, 0.3, 0.5] }];
  const [plate] = shellPlateBoxes(boxes, CELL, 0.2);
  assert.equal(plate.size[0], 0.4);
  assert.equal(plate.size[2], 0.5);
  assert.ok(Math.abs(plate.size[1] - 0.06) < 1e-9, `толщина ${plate.size[1]}`);
});

test("нарисованный объём сходится с авторским материалом", () => {
  const boxes = [
    { center: [0, 0, 0], size: [0.3, 0.14, 0.5] },
    { center: [1, 0, 0], size: [0.14, 0.4, 0.2] },
    { center: [2, 0, 0], size: [0.28, 0.28, 0.14] },
  ];
  const scale = 0.06;
  const volume = (box) => box.size[0] * box.size[1] * box.size[2];
  const before = boxes.reduce((sum, box) => sum + volume(box), 0);
  const after = shellPlateBoxes(boxes, CELL, scale).reduce(
    (sum, box) => sum + volume(box),
    0,
  );
  assert.ok(
    Math.abs(after - before * scale) < 1e-9,
    `${after} против ${before * scale}`,
  );
});

test("плита не вырождается в ноль", () => {
  const boxes = [{ center: [0, 0, 0], size: [0.1, 0.1, 0.1] }];
  const [plate] = shellPlateBoxes(boxes, CELL, 0.0001);
  assert.ok(plate.size[1] >= 0.008, `толщина ${plate.size[1]}`);
});

test("корпус боевого коптера перестаёт раздуваться", () => {
  const hull = combatHexacopterRangeScene.breakablePieces.find(
    (piece) =>
      piece.id === "combat-hexacopter-range:vehicle:armoured-body-shell:piece",
  );
  assert.ok(hull?.visualMesh);
  const compiled = compilePieceDamageGeometry(hull);
  assert.ok(compiled);

  const cell = compiled.body.cellSize;
  const scale = compiled.body.volumeScale;
  assert.ok(scale !== undefined && scale < 0.1, `volumeScale ${scale}`);

  const plates = shellPlateBoxes(compiled.boxes, cell, scale);
  const boxVolume = (box) => box.size[0] * box.size[1] * box.size[2];
  const beforeVolume = compiled.boxes.reduce((sum, box) => sum + boxVolume(box), 0);
  const afterVolume = plates.reduce((sum, box) => sum + boxVolume(box), 0);

  // Нарисованный объём обязан сойтись с АВТОРСКИМ материалом, а не с решёткой.
  assert.ok(
    afterVolume < beforeVolume * 0.35,
    `объём ${afterVolume.toFixed(4)} против прежних ${beforeVolume.toFixed(4)}`,
  );
  assert.ok(
    afterVolume > hull.volume * 0.5 && afterVolume < hull.volume * 3,
    `объём плит ${afterVolume.toFixed(4)} не сошёлся с материалом ${hull.volume.toFixed(4)}`,
  );

  // Ни одна плита не толще самой толстой клетки — силуэт больше не пухнет.
  const thickest = Math.max(...plates.map((box) => Math.min(...box.size)));
  assert.ok(
    thickest < Math.min(...cell),
    `самая толстая плита ${thickest} против клетки ${Math.min(...cell)}`,
  );
});
