import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DOME_FACE_COUNT,
  DOME_FACE_SIZE,
  DOME_FACES_PER_FRAME,
  DOME_REPAINT_STRIDES,
  DOME_SETTLE_CYCLES,
  SKY_DOME_CACHE_ENABLED,
  domeNeedsContinuousRepaint,
  sunDirectionBucket,
} from "../games/make-a-mess/src/game/skyDomeModel.ts";

// Амортизированный купол: небо направленно и не зависит от точки взгляда,
// поэтому марш воздуха и палубы выполняется в кубокарту по грани за кадр, а
// кадр читает её одной выборкой. Тест держит два закона: бюджет перекраски
// (сколько пикселей маршируется за кадр) и честность амортизации (грани — на
// авторском максимуме, scene-linear, живой марш возвращается при движущемся
// солнце).

test("купол: бюджет перекраски посчитан и пришпилен", () => {
  // Рубильник закоммичен только включённым; false — локальный A/B.
  assert.equal(SKY_DOME_CACHE_ENABLED, true);

  // 512 px на 90° — 5.7 px/градус: диск солнца ~3 текселя, куча — десятки.
  assert.ok(
    DOME_FACE_SIZE <= 512,
    `грань ${DOME_FACE_SIZE} дороже согласованного бюджета`,
  );
  // Больше одной грани за кадр — уже не амортизация.
  assert.equal(DOME_FACES_PER_FRAME, 1);
  assert.equal(DOME_FACE_COUNT, 6);

  // Худший постоянный случай (палуба дрейфует): одна грань за кадр.
  const marchedPixelsPerFrame = DOME_FACE_SIZE * DOME_FACE_SIZE * DOME_FACES_PER_FRAME;
  assert.ok(
    marchedPixelsPerFrame <= 512 * 512,
    `перекраска ${marchedPixelsPerFrame} px/кадр — дороже одной грани 512`,
  );

  // Страйд перекраски — ось спуска губернатора: авторский максимум не
  // страйдится, вниз по качеству оборот только растягивается. Сам марш
  // грани качеством НЕ спускается — это закон, а не настройка.
  assert.equal(DOME_REPAINT_STRIDES.length, 3);
  assert.equal(DOME_REPAINT_STRIDES[2], 1);
  assert.ok(
    DOME_REPAINT_STRIDES[0] >= DOME_REPAINT_STRIDES[1] &&
      DOME_REPAINT_STRIDES[1] >= DOME_REPAINT_STRIDES[2],
    "страйд купола растёт только вниз по качеству",
  );

  // Один оборот после инвалидации недостаточен: вход в мир несёт переходные
  // состояния, и купол, замерший по первому обороту, замораживает их
  // навсегда (чёрный сектор города). Минимум два чистых оборота.
  assert.ok(
    DOME_SETTLE_CYCLES >= 2,
    `settle ${DOME_SETTLE_CYCLES} оборотов — купол может заморозить транзиент входа`,
  );
});

test("купол: перекраску просят палуба и солнце, а не каждый кадр", () => {
  // Чистое небо статично между сдвигами солнца — непрерывная перекраска
  // нужна только дрейфующей палубе.
  assert.equal(domeNeedsContinuousRepaint(0), false);
  assert.equal(domeNeedsContinuousRepaint(0.27), true);

  // Бакет — тот же закон, что у PMREM-перепечки ambient (×10 / ×14 / ×10):
  // купол и ambient обязаны считать «солнце сдвинулось» одинаково.
  assert.equal(sunDirectionBucket(0.31, 0.5, -0.81), "3:7:-8");
  assert.equal(
    sunDirectionBucket(0.31, 0.5, -0.81),
    sunDirectionBucket(0.33, 0.52, -0.83),
  );
});

test("купол: грани печатаются честно, живой марш возвращается вовремя", () => {
  const source = readFileSync(
    new URL(
      "../games/make-a-mess/src/game/WorldEnvironment.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  // Грань маршируется на авторском максимуме, а не на текущем качестве
  // губернатора: амортизация — не спуск.
  assert.match(
    source,
    /setSkyMarchQuality\(material, 2\)/,
    "грань купола обязана марщироваться на авторском максимуме",
  );
  // Радианс в кубокарте — scene-linear: tonemapping на печати граней выключен,
  // иначе хвост конвейера применит его второй раз.
  assert.match(
    source,
    /gl\.toneMapping = NoToneMapping/,
    "печать грани обязана выключать tonemapping",
  );
  // Движущееся солнце снимает кэш с экрана И у ambient-перепечки.
  assert.match(
    source,
    /sunIsMoving[\s\S]{0,200}environmentState\.skyDomeTexture = null/,
    "движущееся солнце обязано возвращать живой марш",
  );
  // Ambient печётся из готового купола переблюром, а не шестью рендерами неба.
  assert.match(
    source,
    /pmrem\.fromCubemap\(environmentState\.skyDomeTexture\)/,
    "ambient обязан переиспользовать готовый купол",
  );
});
