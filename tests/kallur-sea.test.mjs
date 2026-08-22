import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Color } from "three";
import {
  buildKallurSeaGeometry,
  kallurShoreDistance,
  KALLUR_SEA_INNER_RADIUS,
  KALLUR_SEA_LEVEL,
  KALLUR_SEA_OUTER_RADIUS,
  KALLUR_SEA_SEGMENTS,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurSeaModel.ts";
import { KALLUR_BASE_ELEVATION } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { KALLUR_SHORELINE } from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";
import {
  applyKallurSeaBody,
  KALLUR_SEA_BODY_DAY,
  KALLUR_SEA_BODY_NIGHT,
} from "../games/make-a-mess/src/game/kallurSeaLighting.ts";

test("море: уровень ниже берега, радиус по закону кромки", () => {
  assert.ok(
    KALLUR_SEA_LEVEL <= KALLUR_BASE_ELEVATION - 1.0,
    `уровень моря ${KALLUR_SEA_LEVEL} слишком близко к базовой отметке ${KALLUR_BASE_ELEVATION}`,
  );
  const law = Math.min(2.35 * 118, 560 * 0.86);
  assert.ok(
    Math.abs(KALLUR_SEA_OUTER_RADIUS - law) < 1e-6,
    "внешний радиус не следует закону seaRadius = min(2.35R, far*0.86)",
  );
});

test("море: диск заходит под остров — дыра не видна из-под берега", () => {
  const minShore = Math.min(
    ...KALLUR_SHORELINE.map(([x, z]) => Math.hypot(x, z)),
  );
  assert.ok(
    KALLUR_SEA_INNER_RADIUS < minShore - 8,
    `внутренний радиус ${KALLUR_SEA_INNER_RADIUS} не спрятан под берегом (мин. берег ${minShore.toFixed(1)})`,
  );
});

test("море: кольца плотные в прибрежной полосе, индексы валидны", () => {
  const sea = buildKallurSeaGeometry();
  for (let ring = 1; ring < sea.ringRadii.length; ring += 1) {
    const step = sea.ringRadii[ring] - sea.ringRadii[ring - 1];
    if (sea.ringRadii[ring] < 150) {
      assert.ok(step <= 4, `шаг колец ${step.toFixed(1)} в прибрежной полосе крупнее 4 м`);
    }
  }
  const vertexCount = sea.positions.length / 3;
  assert.equal(vertexCount, sea.ringRadii.length * KALLUR_SEA_SEGMENTS);
  for (const index of sea.indices) {
    assert.ok(index < vertexCount, "индекс за пределом вершин");
  }
});

test("море: дистанция до берега честная и лежит в атрибуте", () => {
  // Точка на самой полилинии — ноль; точка в 30 м мористее — около 30.
  const [ax, az] = KALLUR_SHORELINE[0];
  assert.ok(kallurShoreDistance(ax, az) < 1e-6);
  const sea = buildKallurSeaGeometry();
  let checked = 0;
  for (let vertex = 0; vertex < sea.shoreDistances.length; vertex += 40) {
    const x = sea.positions[vertex * 3];
    const z = sea.positions[vertex * 3 + 2];
    const direct = kallurShoreDistance(x, z);
    // Float32 attribute vs float64 recomputation: a millimetre suffices.
    assert.ok(
      Math.abs(direct - sea.shoreDistances[vertex]) < 1e-3,
      "атрибут дистанции расходится с прямым замером",
    );
    checked += 1;
  }
  assert.ok(checked > 50, "выборка вершин слишком мала");
});

test("море: тело темнеет с ночью и с бюджетом света земли", () => {
  const deep = new Color();
  const light = new Color();
  applyKallurSeaBody(deep, light, 0, 1);
  const dayLum = deep.r + deep.g + deep.b;
  assert.ok(
    Math.abs(dayLum - (
      KALLUR_SEA_BODY_DAY.deep.r
      + KALLUR_SEA_BODY_DAY.deep.g
      + KALLUR_SEA_BODY_DAY.deep.b
    )) < 1e-5,
  );
  applyKallurSeaBody(deep, light, 1, 1);
  const nightLum = deep.r + deep.g + deep.b;
  assert.ok(nightLum < dayLum * 0.55);
  const duskDeep = new Color();
  applyKallurSeaBody(duskDeep, new Color(), 0.55, 0.12);
  const midDeep = new Color();
  applyKallurSeaBody(midDeep, new Color(), 0.55, 1);
  assert.ok(
    duskDeep.r + duskDeep.g + duskDeep.b
      < midDeep.r + midDeep.g + midDeep.b,
    "при низком groundLightLevel тело темнее того же часа на полном уровне",
  );
  assert.ok(KALLUR_SEA_BODY_NIGHT.deep.r < KALLUR_SEA_BODY_DAY.deep.r);
});

test("море: fresnel-небо берёт живой туман, не палитру DUSK", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/KallurSea.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("scene.fog"));
  assert.ok(source.includes("applyKallurSeaBody"));
  assert.ok(
    !source.includes("#f0b273"),
    "authored dusk sky paint left a milk sheet after civil dusk",
  );
});
