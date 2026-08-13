import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  ASTANA_EDGE_BOUNDARY,
  FUTURE_ROAD_FULL_WIDTH,
  GROUND_PITCH,
  LAND_BASE_RADIUS,
  OUTER_LAYOUT_RESERVE,
  PENINSULA_HALF_ANGLES_DEGREES,
  PENINSULA_SHORE_RADII,
  RIVER_VALLEY_MARGIN,
  WORLD_RADIUS,
  groundKindAt,
  groundUnder,
  landRadiusAt,
  riverAxisZ,
  riverHalfWidth,
  shoreRadiusAtAngle,
} from "../games/make-a-mess/src/content/scenes/astana/astanaShell.ts";

const pieces = astanaScene.breakablePieces;
const withPrefix = (prefix) =>
  pieces.filter((piece) => piece.id.startsWith(`astana:${prefix}`));

test("the island is the largest world and carries its licence", () => {
  assert.equal(astanaScene.id, "astana");
  assert.equal(LAND_BASE_RADIUS,
    112 + FUTURE_ROAD_FULL_WIDTH * 3 + OUTER_LAYOUT_RESERVE - 8);
  assert.equal(WORLD_RADIUS, 210);
  assert.equal(astanaScene.worldEdgeBoundary.length, 192);
  assert.deepEqual(astanaScene.worldEdgeBoundary, ASTANA_EDGE_BOUNDARY);
  assert.equal(astanaScene.contentLicense, "CC-BY-NC-ND-4.0");
  assert.equal(astanaScene.indestructible, true);
});

test("nothing starts unsupported", () => {
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the shell is built to its budget, not sketched", () => {
  // Детектор упрощения: увеличенная оболочка площадью почти 60 000 м² не
  // может стоить пару сотен деталей.
  // пару сотен деталей. Числа — нижние границы из паспорта мира.
  assert.ok(pieces.length >= 4600, `деталей всего: ${pieces.length}`);
  assert.ok(withPrefix("terrain-base").length >= 2000);
  assert.ok(withPrefix("terrain-surface").length >= 2000);
  // Пояс прорежен просеками: кольцо и четыре станции с вестибюлями вырубают
  // из него по своей поляне, поэтому нижняя граница ниже двух тысяч.
  // Four stations plus the now full-size Nur Alem, Opera and Arch clear
  // deliberate view and access corridors through the shelter belt.
  assert.ok(withPrefix("green-belt").length >= 1500);
  assert.ok(withPrefix("steppe-tufts").length >= 500);
  assert.ok(withPrefix("river-bed").length >= 250);
});

test("everything stands inside the ring wall", () => {
  for (const piece of pieces) {
    const [x, , z] = piece.position;
    const radius = Math.hypot(x, z);
    assert.ok(
      radius <= WORLD_RADIUS - 1,
      `${piece.id} вышел за стену мира: ${radius.toFixed(1)} м`,
    );
  }
});

test("the river leaves a real channel, two steps deep", () => {
  // Ни один травяной тайл не лежит в русле, и дно действительно ниже берега,
  // а берег ниже суши — уступы видны в разрезе.
  const cover = withPrefix("terrain-surface:cover");
  assert.ok(cover.length > 0);
  for (const piece of cover) {
    const [x, , z] = piece.position;
    assert.equal(
      groundKindAt(x, z),
      "land",
      `травяной тайл ${piece.id} лежит в русле`,
    );
    // И ни один тайл степи не тянет за собой городской профиль поверхности:
    // он рисует тропы ЧУЖОГО города прямо по нашему грунту.
    assert.equal(piece.landscapeSurface, undefined);
  }

  const bed = withPrefix("terrain-surface:bed");
  const bank = withPrefix("terrain-surface:bank");
  const terrace = withPrefix("terrain-surface:terrace");
  // Весь поперечник долины уменьшен ровно на 30%, но каждая из трёх
  // ступеней обязана оставаться непрерывной.
  assert.ok(bed.length >= 115, `тайлов дна: ${bed.length}`);
  assert.ok(bank.length >= 100, `тайлов берега: ${bank.length}`);
  assert.ok(terrace.length >= 100, `тайлов поймы: ${terrace.length}`);

  // Три ступени: пойма ниже суши, берег ниже поймы, дно ниже берега. Один
  // уступ читался вертикальной стенкой из тайлов.
  const top = (list) => Math.max(...list.map((piece) => piece.position[1]));
  assert.ok(top(bed) < top(bank) - 0.5, "дно должно быть ниже берега");
  assert.ok(top(bank) < top(terrace) - 0.3, "берег должен быть ниже поймы");
  assert.ok(top(terrace) < top(cover) - 0.3, "пойма должна быть ниже суши");
});

test("the channel crosses the whole island", () => {
  // Река входит и выходит за кромку: это не пруд в середине.
  for (const x of [-120, -95, -40, 0, 40, 95, 120]) {
    const z = riverAxisZ(x);
    assert.equal(groundKindAt(x, z), "bed", `на x=${x} русла нет`);
    assert.ok(riverHalfWidth(x) > 4.5, `на x=${x} русло исчезло`);
  }
  // Правый берег за поймой остаётся достаточно широким для целиноградского
  // квартала: дом 32×12 м, двор и улица перед ним.
  const northShore = LAND_BASE_RADIUS - riverAxisZ(0)
    - riverHalfWidth(0) - RIVER_VALLEY_MARGIN;
  assert.ok(northShore > 70, `правый берег всего ${northShore.toFixed(1)} м`);

  // Сужение всей долины, а не только песчаного дна, возвращает кругу
  // Байтерека сплошную опору по всей окружности.
  for (let step = 0; step < 64; step += 1) {
    const angle = step / 64 * Math.PI * 2;
    assert.equal(groundKindAt(Math.cos(angle) * 16, Math.sin(angle) * 16), "land");
  }
});

test("four broad peninsulas own the exact shoreline while the gaps keep the old body", () => {
  const directions = [
    [49, -41, PENINSULA_SHORE_RADII.khan],
    [-49, 41, PENINSULA_SHORE_RADII.pyramid],
    [-43, -58, PENINSULA_SHORE_RADII.expo],
    [43, 58, PENINSULA_SHORE_RADII.virginLands],
  ];
  for (const [x, z, expected] of directions) {
    const radius = shoreRadiusAtAngle(Math.atan2(z, x));
    assert.ok(Math.abs(radius - expected) < 1.2,
      `вершина полуострова ${x},${z}: ${radius.toFixed(2)} м`);
  }

  const sampledRadii = ASTANA_EDGE_BOUNDARY.map(([x, z]) => Math.hypot(x, z));
  assert.ok(Math.max(...sampledRadii) < WORLD_RADIUS - 2);
  assert.ok(Math.min(...sampledRadii) > LAND_BASE_RADIUS - 1.2);
  assert.ok(sampledRadii.some((radius) => radius < LAND_BASE_RADIUS + 1),
    "между полуостровами исчезло прежнее степное тело");
  assert.deepEqual(PENINSULA_HALF_ANGLES_DEGREES, {
    khan: 30,
    pyramid: 40,
    expo: 30,
    virginLands: 28,
  });
});

test("the new annulus outside the LRT is bare soil reserved for later roads", () => {
  const outer = withPrefix("terrain-surface:cover").filter((piece) =>
    Math.hypot(piece.position[0], piece.position[2]) > 105);
  assert.ok(outer.length >= 600, `внешних тайлов грунта: ${outer.length}`);
  assert.ok(outer.every((piece) => piece.material === "soil"));
});

test("the shelter belt is planted on real tiles, clear of the rim", () => {
  const trunks = withPrefix("green-belt").filter((piece) =>
    piece.id.includes(":trunk"),
  );
  assert.ok(trunks.length >= 60, `стволов: ${trunks.length}`);
  for (const trunk of trunks) {
    const [x, , z] = trunk.position;
    assert.equal(groundUnder(x, z).kind, "land", `${trunk.id} стоит не на суше`);
    assert.ok(
      Math.hypot(x, z) <= landRadiusAt(x, z) - 2.2,
      `${trunk.id} ближе 2.2 м к обрыву`,
    );
  }
});

test("props sit on the tile under them, not on a formula", () => {
  // Урок сборки: сетка дискретна, а кромка и русло считаются непрерывно.
  // Каждый камень и пучок обязан опираться на тайл, который реально под ним.
  for (const piece of [...withPrefix("river-bed"), ...withPrefix("steppe-tufts")]) {
    const [x, y, z] = piece.position;
    const soil = groundUnder(x, z);
    const bottom = y - piece.size[1] / 2;
    assert.ok(
      bottom >= soil.top - 0.35 && bottom <= soil.top + 0.05,
      `${piece.id} висит: низ ${bottom.toFixed(2)}, грунт ${soil.top.toFixed(2)}`,
    );
  }
});

test("the ground grid keeps its pitch", () => {
  for (const piece of withPrefix("terrain-base")) {
    const [x, , z] = piece.position;
    // Math.abs: у отрицательных координат остаток даёт −0, а strict-равенство
    // считает −0 и 0 разными значениями.
    assert.equal(Math.abs(x % GROUND_PITCH), 0);
    assert.equal(Math.abs(z % GROUND_PITCH), 0);
  }
});

test("every content file states its licence", () => {
  // Лицензионная граница держится SPDX-заголовками, а не памятью автора.
  const directory = "games/make-a-mess/src/content/scenes/astana";
  const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));
  assert.ok(files.length >= 3, `файлов контента: ${files.length}`);
  for (const name of files) {
    const head = readFileSync(`${directory}/${name}`, "utf8").slice(0, 400);
    assert.match(
      head,
      /SPDX-License-Identifier: CC-BY-NC-ND-4\.0/,
      `${name} без SPDX-заголовка`,
    );
  }
});
