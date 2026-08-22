/**
 * ЛИВРЕЯ DC-3 «CROSSTOWN AIRWAYS»: ГЕЙТЫ ПАСПОРТА P01.
 *
 * Паспорт — games/make-a-mess/docs/dc-3/livery-crosstown-p01.md. Все
 * проверки восстанавливают значения из ГОТОВЫХ частей и ассетов, а не
 * пересказывают конструктор: пояс, отступ от лофта, гейт face-fit по
 * нормали, чистые зазоры до окон и дверей, проводка в мир, тень и текстура.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DC3_LIVERY_BAND,
  DC3_LIVERY_BASELINE_Y,
  DC3_LIVERY_CAP_HEIGHT,
  DC3_LIVERY_GROUP,
  dc3LiveryTitleParts,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3LiveryTitles.ts";
import {
  DC3_WINDOW_SIZE,
  dc3AirframeSurface,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";
import { createDc3AirplaneGroup } from "../games/make-a-mess/src/content/scenes/dc3AirplaneDocument.ts";
import { pieceCastsShadow } from "../games/make-a-mess/src/game/intactWorldBatching.ts";

const PLACEMENT = {
  sceneId: "test",
  clusterId: "test:dc3",
  position: [0, 0, 0],
  yaw: 0,
};

function bodyVertices(part) {
  return part.vertices.map((vertex) => dc3AirframeSurface.worldToBody(vertex));
}

test("лента титулов: две части, пояс и группа по паспорту", () => {
  assert.equal(dc3LiveryTitleParts.length, 2);
  const ids = dc3LiveryTitleParts.map((part) => part.id).sort();
  assert.deepEqual(ids, ["livery-title-left", "livery-title-right"]);
  for (const part of dc3LiveryTitleParts) {
    assert.equal(part.group, DC3_LIVERY_GROUP);
    assert.equal(part.kind, "mesh");
    const body = bodyVertices(part);
    for (const [x, y, z] of body) {
      assert.ok(y > DC3_LIVERY_BAND.yBottom - 0.01, `вершина ниже пояса: ${y}`);
      assert.ok(y < DC3_LIVERY_BAND.yTop + 0.01, `вершина выше пояса: ${y}`);
      assert.ok(z > DC3_LIVERY_BAND.zAft - 1e-6 && z < DC3_LIVERY_BAND.zFore + 1e-6);
      const side = part.id.endsWith("right") ? 1 : -1;
      assert.ok(x * side > 0, "лента ушла на чужой борт");
    }
  }
});

test("лента стоит НАД лофтом: наружная оболочка 2.5–6.5 мм, изнанка не заглублена", () => {
  for (const part of dc3LiveryTitleParts) {
    const body = bodyVertices(part);
    const half = body.length / 2;
    body.forEach(([x, y, z], index) => {
      const station = dc3AirframeSurface.fuselage.at(z);
      const centreY = (station.crown + station.keel) / 2;
      const halfHeight = (station.crown - station.keel) / 2;
      const px = x / station.halfWidth;
      const py = (y - centreY) / halfHeight;
      const radial = Math.hypot(px, py);
      // Расстояние до лофта вдоль луча из центра сечения; сечение почти
      // круглое (1.34 против 1.33), поэтому луч ≈ нормаль с точностью ~1%.
      const metric = Math.hypot(x, y - centreY);
      const distance = metric * (1 - 1 / radial);
      if (index < half) {
        assert.ok(
          distance > 0.0025 && distance < 0.0065,
          `наружная оболочка не на месте: ${distance.toFixed(4)} м (z=${z.toFixed(2)})`,
        );
      } else {
        assert.ok(
          distance > 0.0002 && distance < 0.0035,
          `изнанка заглублена или висит: ${distance.toFixed(4)} м (z=${z.toFixed(2)})`,
        );
      }
    });
  }
});

test("гейт face-fit: нормаль каждой вершины держит |n.x| выше 0.55", () => {
  for (const part of dc3LiveryTitleParts) {
    assert.ok(part.normals, "лента обязана нести явные нормали");
    assert.equal(part.normals.length, part.vertices.length);
    for (const normal of part.normals) {
      // Тангаж стойки вращает вокруг X и n.x не трогает.
      assert.ok(
        Math.abs(normal[0]) >= 0.55,
        `нормаль завалилась к короне: n.x=${normal[0].toFixed(3)}`,
      );
    }
  }
});

test("чистые зазоры: над обвязкой окон, мимо обоих дверных проёмов", () => {
  const windowTop =
    dc3AirframeSurface.windows[0].centreY + DC3_WINDOW_SIZE.across / 2 + 0.045;
  assert.ok(
    DC3_LIVERY_BAND.yBottom >= windowTop + 0.03,
    `пояс лёг на обвязку: низ ${DC3_LIVERY_BAND.yBottom}, верх окна ${windowTop}`,
  );
  for (const entry of dc3AirframeSurface.cabinEntries) {
    const clear =
      entry.zFrom > DC3_LIVERY_BAND.zFore + 0.2 ||
      entry.zTo < DC3_LIVERY_BAND.zAft - 0.2;
    assert.ok(clear, `лента задевает проём ${entry.id}`);
  }
});

test("проводка в мир: профиль, ненесущий кусок без подвесов, без тени", () => {
  const parts = dc3AirframeParts();
  const ribbons = parts.filter((part) => part.group === DC3_LIVERY_GROUP);
  assert.equal(ribbons.length, 2, "состав планера потерял ленту");

  const group = createDc3AirplaneGroup(PLACEMENT);
  const pieces = group.objects.filter((object) =>
    object.id.startsWith("livery-title-"),
  );
  assert.equal(pieces.length, 2);
  for (const piece of pieces) {
    assert.equal(piece.material, "aluminium");
    assert.equal(piece.textureProfile, "dc3-livery-titles");
    assert.equal(piece.bearsLoad, false, "краска не несёт нагрузку");
    assert.equal(piece.carriesAttachments, false, "на краску не вешают куски");
    assert.ok(piece.visualMesh, "лента обязана быть лофтовой сеткой");
    assert.equal(
      pieceCastsShadow(piece),
      false,
      "лента-вырубка затенила бы борт целым прямоугольником",
    );
  }
  const skinSample = group.objects.find((object) =>
    object.id.startsWith("fuselage:"),
  );
  assert.ok(skinSample);
  assert.equal(pieceCastsShadow(skinSample), true, "обшивка тень не теряет");
});

test("ключ программы: face-fit ленты отличен от alclad обшивки", async () => {
  const { pieceProgramCacheKey } = await import(
    "../games/make-a-mess/src/game/materialTextures.ts"
  );
  const livery = pieceProgramCacheKey("aluminium", "dc3-livery-titles", true);
  assert.ok(livery.includes("face-fit"));
  assert.notEqual(livery, pieceProgramCacheKey("aluminium", "alclad-riveted", true));
  assert.notEqual(livery, pieceProgramCacheKey("aluminium", undefined, true));
});

test("ассет текстуры: размер пояса, альфа-маска, глифы в поясе капители", async () => {
  const sharp = (await import("sharp")).default;
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "games",
    "make-a-mess",
    "textures",
    "dc3-livery-titles.png",
  );
  const image = sharp(path);
  const metadata = await image.metadata();
  const bandAspect =
    (DC3_LIVERY_BAND.zFore - DC3_LIVERY_BAND.zAft) /
    (DC3_LIVERY_BAND.yTop - DC3_LIVERY_BAND.yBottom);
  assert.equal(metadata.width, 4096);
  assert.equal(metadata.height, Math.round(4096 / bandAspect));
  assert.equal(metadata.hasAlpha, true);

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  // Углы чистые: лента между буквами обязана вырубаться до обшивки.
  for (const [x, y] of [
    [2, 2],
    [info.width - 3, 2],
    [2, info.height - 3],
    [info.width - 3, info.height - 3],
  ]) {
    assert.equal(alphaAt(x, y), 0, `угол (${x},${y}) не прозрачен`);
  }
  // Посреди пояса капители глифы есть: строка на высоте середины букв.
  const bandHeight = DC3_LIVERY_BAND.yTop - DC3_LIVERY_BAND.yBottom;
  const midCapV =
    (DC3_LIVERY_BASELINE_Y + DC3_LIVERY_CAP_HEIGHT / 2 - DC3_LIVERY_BAND.yBottom) /
    bandHeight;
  // Маска записана ПЕРЕВЁРНУТОЙ (эмпирический закон x-ветки face-fit, см.
  // генератор): строка капители считается от ВЕРХА изображения.
  const midCapRow = Math.round(midCapV * info.height);
  let opaque = 0;
  for (let x = 0; x < info.width; x += 1) {
    if (alphaAt(x, midCapRow) > 200) opaque += 1;
  }
  assert.ok(
    opaque > info.width * 0.2,
    `в строке капители слишком мало краски: ${opaque} колонок`,
  );
});
