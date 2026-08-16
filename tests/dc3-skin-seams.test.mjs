import assert from "node:assert/strict";
import test from "node:test";
import {
  ALCLAD_SEAM_LATTICE,
  alcladSeamFragment,
  alcladSeamGlsl,
  alcladSeamRoughness,
  panelCell,
  panelTint,
  rivetShade,
  seamOffset,
  seamShade,
} from "../games/make-a-mess/src/game/skinSeamLattice.ts";
import { createDc3AirplaneGroup } from "../games/make-a-mess/src/content/scenes/dc3AirplaneDocument.ts";

const placement = {
  sceneId: "test",
  clusterId: "test:dc3",
  position: [12, 0.4, -30],
  yaw: Math.PI / 2,
};

// §8.1 — числа профиля равны паспорту. Правка «на глаз» падает здесь.
test("the lattice matches skin-seam passport P01", () => {
  assert.deepEqual(ALCLAD_SEAM_LATTICE, {
    rivetPitch: 0.028,
    rivetHeadWidth: 0.004,
    rivetCrest: 0.25,
    rivetShadow: 0.21,
    stringerRowPitch: 0.075,
    lapSeamPitch: 0.15,
    frameSeamPitch: 0.5,
    seamCrest: 0.05,
    seamTrough: 0.026,
    seamWidth: 0.018,
    panelTintSigma: 0.04,
    panelOilCanDepth: 0.0012,
    sectionTintPitch: 3.2,
    sectionTintSigma: 0.05,
    panelRoughnessSigma: 0.03,
  });
});

// §8.2 — отношения восстанавливаются ИЗ констант, а не переписаны рядом.
test("passport relations are recovered from the constants", () => {
  const lattice = ALCLAD_SEAM_LATTICE;

  // Нахлёст — ровно два ряда заклёпок: единственное отношение, подтверждённое
  // обоими снимками (2.11 на носовой части, 2.03 на хвостовой).
  assert.equal(lattice.lapSeamPitch / lattice.stringerRowPitch, 2);

  // Ячейка вытянута вдоль обшивки: квадратная клетка — уже не DC-3.
  const cellAspect = lattice.frameSeamPitch / lattice.lapSeamPitch;
  assert.equal(cellAspect > 2.8 && cellAspect < 4.0, true);

  // Головка — около 15% шага (2.47 px из 16.93 px).
  const headShare = lattice.rivetHeadWidth / lattice.rivetPitch;
  assert.equal(headShare > 0.13 && headShare < 0.17, true);

  // Шов шире заклёпочной головки в разы и слабее её по контрасту в разы:
  // ровно этим он и отличается от нарисованной линии.
  assert.equal(lattice.seamWidth > lattice.rivetHeadWidth * 3, true);
  assert.equal(lattice.seamCrest < lattice.rivetCrest / 3, true);
});

test("a lap joint is a soft asymmetric band, not a hairline", () => {
  const lattice = ALCLAD_SEAM_LATTICE;

  // Светлый скат стоит с одной стороны, затенённая полка — с другой.
  const lip = seamShade(-lattice.seamWidth * 0.5);
  const step = seamShade(lattice.seamWidth * 0.4);
  assert.equal(lip > 0, true);
  assert.equal(step < 0, true);
  assert.equal(Math.abs(lip - lattice.seamCrest) < 1e-9, true);

  // За пределами полосы шва нет вовсе — иначе панель тонировалась бы целиком.
  assert.equal(seamShade(lattice.seamWidth * 1.5), 0);
  assert.equal(seamShade(-lattice.seamWidth * 1.5), 0);

  // Контраст в паспортном коридоре: выше 15% — это уже наклейка.
  for (let offset = -0.05; offset <= 0.05; offset += 0.0005) {
    assert.equal(Math.abs(seamShade(offset)) < 0.15, true);
  }
});

test("a rivet is a bright head with its own shadow beside it", () => {
  const centred = rivetShade(0, 0);
  assert.equal(centred.head, 1);

  // Тень смещена в сторону: в центре головки её вклад слабее самой головки.
  assert.equal(centred.shadow < centred.head, true);

  // Между заклёпками — чистый металл.
  const between = rivetShade(ALCLAD_SEAM_LATTICE.rivetPitch / 2, 0);
  assert.equal(between.head, 0);

  // Между рядами — тоже.
  const offRow = rivetShade(0, ALCLAD_SEAM_LATTICE.stringerRowPitch / 2);
  assert.equal(offRow.head, 0);
});

// §8.3 — поле периодично в телесных метрах и не зависит от размещения.
test("the lattice repeats in body metres wherever the aeroplane is parked", () => {
  const lattice = ALCLAD_SEAM_LATTICE;

  for (const anchor of [0, 12.5, -30.75, 1234.5]) {
    for (const step of [0, 0.007, 0.019, 0.031]) {
      const along = anchor + step;
      assert.equal(
        Math.abs(
          seamOffset(along, lattice.frameSeamPitch)
            - seamOffset(along + lattice.frameSeamPitch, lattice.frameSeamPitch),
        ) < 1e-9,
        true,
      );
      assert.equal(
        Math.abs(
          rivetShade(along, 0).head - rivetShade(along + lattice.rivetPitch, 0).head,
        ) < 1e-9,
        true,
      );
    }
  }

  // Панель меняется ровно на границе ячейки, а не плавно.
  assert.deepEqual(panelCell(0.49, 0.14), [0, 0]);
  assert.deepEqual(panelCell(0.51, 0.14), [1, 0]);
  assert.deepEqual(panelCell(0.49, 0.16), [0, 1]);
});

test("panel tint stays inside the measured scatter", () => {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let along = 0; along < 20; along += 0.5) {
    for (let across = 0; across < 6; across += 0.15) {
      const tint = panelTint(along + 0.01, across + 0.01);
      minimum = Math.min(minimum, tint);
      maximum = Math.max(maximum, tint);
    }
  }
  // Материалу принадлежит sigma 4%, остальной разнотон обязан прийти из
  // отражения. Разброс шире — это запечённая в альбедо пятнистая жесть.
  assert.equal(minimum >= 1 - ALCLAD_SEAM_LATTICE.panelTintSigma, true);
  assert.equal(maximum <= 1 + ALCLAD_SEAM_LATTICE.panelTintSigma, true);
});

// §8.4 — каждое семейство обязано гаснуть по производной, иначе муар.
test("every family is gated by its own resolve fade", () => {
  const shader = `${alcladSeamGlsl()}\n${alcladSeamFragment()}`;
  assert.equal(shader.includes("fwidth("), true);
  for (const fade of [
    "alcladRingFade",
    "alcladLapFade",
    "alcladRowFade",
    "alcladRivetFade",
  ]) {
    assert.equal(shader.includes(`float ${fade} =`), true);
    // Объявить мало: гейт должен быть ПРИМЕНЁН, а не просто посчитан.
    assert.equal(shader.split(fade).length > 2, true);
  }
});

test("the shader carries the passport numbers, not its own", () => {
  const shader = [alcladSeamGlsl(), alcladSeamFragment(), alcladSeamRoughness()]
    .join("\n");
  for (
    const value of [
      ALCLAD_SEAM_LATTICE.rivetPitch,
      ALCLAD_SEAM_LATTICE.rivetCrest,
      ALCLAD_SEAM_LATTICE.rivetShadow,
      ALCLAD_SEAM_LATTICE.stringerRowPitch,
      ALCLAD_SEAM_LATTICE.lapSeamPitch,
      ALCLAD_SEAM_LATTICE.frameSeamPitch,
      ALCLAD_SEAM_LATTICE.seamCrest,
      ALCLAD_SEAM_LATTICE.seamTrough,
      ALCLAD_SEAM_LATTICE.seamWidth,
    ]
  ) {
    assert.equal(shader.includes(value.toFixed(4)), true, `missing ${value}`);
  }
});

test("only the outer skin wears the riveted profile", () => {
  const group = createDc3AirplaneGroup(placement);
  const skin = [];
  const other = [];
  for (const object of group.objects) {
    if (object.kind !== "primitive") continue;
    (object.material === "aluminium" ? skin : other).push(object);
  }

  assert.equal(skin.length > 0, true);
  for (const piece of skin) {
    assert.equal(piece.textureProfile, "alclad-riveted", piece.id);
  }
  // Набор внутри и мотогондолы — сталь: клёпаный рисунок им не положен.
  for (const piece of other) {
    assert.equal(piece.textureProfile, undefined, piece.id);
  }
});

test("the fuselage runs the lattice along its own longest axis", () => {
  const group = createDc3AirplaneGroup(placement);
  const fuselage = group.objects.find((object) => object.id === "fuselage-loft");
  assert.notEqual(fuselage, undefined);

  // Закон в шейдере выбирает ось по самому длинному размеру куска: у
  // фюзеляжа это нос-хвост, поэтому кольца встают поперёк борта, а полосы
  // идут вдоль. Если бы победила другая ось, рисунок лёг бы поперёк.
  const [sx, sy, sz] = fuselage.size;
  assert.equal(sz > sx && sz > sy, true);

  const wing = group.objects.find((object) => object.id === "wing-right");
  assert.notEqual(wing, undefined);
  // У крыла самая длинная ось — размах, поэтому те же кольца читаются
  // нервюрами, а полосы идут по размаху. Одного закона хватает на оба.
  assert.equal(wing.size[0] > wing.size[2], true);
});

// РЕНДЕР БЕРЁТ ПРОГРАММУ ПО КЛЮЧУ, А НЕ ПО ТЕКСТУ ШЕЙДЕРА.
//
// Профиль вставляет свой GLSL в вершинник и фрагментник. Если ключ программы
// его не различает, three переиспользует уже скомпилированную программу
// другого алюминиевого куска — и обшивка молча рисуется без клёпки, хотя все
// проверки текста выше зелёные. Именно так этот профиль и не доехал до кадра
// с первого раза.
test("the riveted skin compiles as its own program", async () => {
  const { pieceProgramCacheKey } = await import(
    "../games/make-a-mess/src/game/materialTextures.ts"
  );
  assert.notEqual(
    pieceProgramCacheKey("aluminium", "alclad-riveted"),
    pieceProgramCacheKey("aluminium"),
    "riveted skin would reuse the plain aluminium program",
  );
  // И обратное: соседний алюминий не должен получить клёпку по чужому ключу.
  assert.equal(
    pieceProgramCacheKey("aluminium"),
    pieceProgramCacheKey("aluminium", "matte-aluminium"),
  );
});

// ВАРИАНТ ПОД ЛОФТ — ТОЖЕ ОТДЕЛЬНАЯ ПРОГРАММА.
//
// У поверхностного меша шейдер не объявляет четыре коробочных атрибута:
// иначе набор упирается в потолок в 16 слотов и драйвер отбраковывает
// программу целиком («Too many attributes»). Раз текст вершинника другой —
// ключ обязан быть другим, иначе лофт получит программу коробки.
test("a lofted surface compiles as its own program", async () => {
  const { pieceProgramCacheKey } = await import(
    "../games/make-a-mess/src/game/materialTextures.ts"
  );
  assert.notEqual(
    pieceProgramCacheKey("aluminium", "alclad-riveted", true),
    pieceProgramCacheKey("aluminium", "alclad-riveted", false),
    "the loft would reuse the box program and blow the attribute budget",
  );
});
