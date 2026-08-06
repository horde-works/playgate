import assert from "node:assert/strict";
import test from "node:test";
import {
  ACROSS_SPANS,
  BANK_WIDTH,
  END_OVERRUN,
  WATER_LEVEL,
  buildWaterSheetModel,
  softenPolyline,
  waterSheetHalfWidth,
} from "../games/make-a-mess/src/game/dutchPolderWaterModel.ts";
import { DUTCH_POLDER_CHANNELS } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";
import { dutchPolderLandscapeDocument } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";
import { createLandscapeSampler } from "../games/make-a-mess/src/content/landscape/landscapeSampler.ts";

const model = buildWaterSheetModel();
const sampler = createLandscapeSampler(dutchPolderLandscapeDocument);
const stride = ACROSS_SPANS + 1;
const centreColumn = ACROSS_SPANS / 2;

/**
 * The sheet is authored in the local XY plane the planar mirror needs. This is
 * the same mapping the mesh's -90° rotation about X performs.
 */
function worldOf(vertex) {
  return [
    model.positions[vertex * 3],
    WATER_LEVEL,
    -model.positions[vertex * 3 + 1],
  ];
}

function channelRings() {
  const rings = [];
  let vertex = 0;
  for (let index = 0; index < model.ringsPerChannel.length; index += 1) {
    const count = model.ringsPerChannel[index];
    rings.push({
      channel: DUTCH_POLDER_CHANNELS[index],
      first: vertex / stride,
      count,
    });
    vertex += count * stride;
  }
  return rings;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
  }
  return total;
}

function distanceToPolyline(x, z, points) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1];
    const [bx, bz] = points[index];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared < 1e-9
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

test("every attribute is finite and indexed inside the sheet", () => {
  const vertexCount = model.positions.length / 3;
  assert.equal(model.flow.length, vertexCount * 2);
  assert.equal(model.shape.length, vertexCount * 2);
  assert.equal(model.tangents.length, vertexCount * 2);
  for (const array of [model.positions, model.flow, model.shape, model.tangents]) {
    assert.ok(array.every(Number.isFinite), "an attribute carries NaN");
  }
  assert.equal(model.indices.length % 3, 0);
  for (const index of model.indices) {
    assert.ok(index < vertexCount, `index ${index} is outside the sheet`);
  }
  // Tangents rotate the ripple slope into the channel; a zero one flattens it.
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const length = Math.hypot(
      model.tangents[vertex * 2],
      model.tangents[vertex * 2 + 1],
    );
    assert.ok(Math.abs(length - 1) < 1e-5, "a channel tangent is not unit");
  }
});

test("every triangle faces up once the sheet is rotated into the world", () => {
  for (let triangle = 0; triangle < model.indices.length; triangle += 3) {
    const [a, b, c] = [
      worldOf(model.indices[triangle]),
      worldOf(model.indices[triangle + 1]),
      worldOf(model.indices[triangle + 2]),
    ];
    const u = [b[0] - a[0], 0, b[2] - a[2]];
    const v = [c[0] - a[0], 0, c[2] - a[2]];
    const up = u[2] * v[0] - u[0] * v[2];
    assert.ok(up > 1e-6, `triangle ${triangle / 3} faces down or is degenerate`);
  }
});

test("the sheet is always wider than any water it can hold", () => {
  // The waterline has to be decided by measured depth. A sheet narrower than
  // bed plus bank would cut it with a straight geometric border instead.
  for (const channel of DUTCH_POLDER_CHANNELS) {
    assert.ok(
      waterSheetHalfWidth(channel.width) >= channel.width / 2 + BANK_WIDTH,
      `${channel.id} sheet stops inside its own bank`,
    );
  }
});

test("the sheet centreline lies in the carved bed of its channel", () => {
  // The landscape softens each channel once before carving. A sheet built from
  // the raw control points drifts more than a metre off the trench at a bend.
  for (const { channel, first, count } of channelRings()) {
    let checked = 0;
    for (let ring = 0; ring < count; ring += 1) {
      const vertex = (first + ring) * stride + centreColumn;
      const alongFromStart = model.flow[vertex * 2];
      const alongFromEnd = model.flow[
        (first + count - 1) * stride * 2 + centreColumn * 2
      ] - alongFromStart;
      if (alongFromStart < END_OVERRUN || alongFromEnd < END_OVERRUN) continue;
      const [x, , z] = worldOf(vertex);
      const sample = sampler.sample(x, z);
      if (sample.groundKind === "outside") {
        // C2 and C3 are authored out to their waterfall mouths, and a mouth
        // may overhang the island boundary by a ring. Nowhere else may the
        // sheet run at full strength over ground the landscape never built.
        assert.ok(
          alongFromEnd <= END_OVERRUN + 1e-6 || alongFromStart <= END_OVERRUN + 1e-6,
          `${channel.id} runs off the island at (${x.toFixed(2)}, ${z.toFixed(2)})`,
        );
        continue;
      }
      // The last few metres before a mouth are a scoured ramp: a second,
      // deeper carve on the same axis, whose upstream end the sampler labels
      // "bank" while its ground is still well below the channel datum. What
      // matters is the HEIGHT under the sheet, not which carve claims it.
      assert.ok(
        sample.groundKind === "bed" || sample.elevation <= -0.25 + 1e-6,
        `${channel.id} leaves its bed at (${x.toFixed(2)}, ${z.toFixed(2)}): `
          + `${sample.groundKind} at ${sample.elevation.toFixed(3)}`,
      );
      checked += 1;
    }
    assert.ok(checked > 4, `${channel.id} was barely sampled`);
  }
});

test("free ends fade out inside the overrun, never across the channel", () => {
  for (const { channel, first, count } of channelRings()) {
    const capStart = model.shape[first * stride * 2 + 1];
    const capEnd = model.shape[((first + count - 1) * stride) * 2 + 1];
    assert.equal(capStart, 0, `${channel.id} starts with a visible cap`);
    assert.equal(capEnd, 0, `${channel.id} ends with a visible cap`);

    // Full strength from the first authored point to the last one: the fade
    // may only eat into the overrun, never into the channel itself.
    const total = model.flow[((first + count - 1) * stride + centreColumn) * 2];
    for (let ring = 0; ring < count; ring += 1) {
      const vertex = (first + ring) * stride + centreColumn;
      const along = model.flow[vertex * 2];
      if (along < END_OVERRUN - 1e-6 || total - along < END_OVERRUN - 1e-6) continue;
      assert.equal(
        model.shape[vertex * 2 + 1],
        1,
        `${channel.id} fades ${along.toFixed(2)} m in, inside its own channel`,
      );
    }
    // And the carved channel really is covered end to end. The carved one is
    // the softened polyline, which is shorter than the raw control points.
    assert.ok(
      total - 2 * END_OVERRUN >= polylineLength(softenPolyline(channel.points)) - 0.05,
      `${channel.id} is shorter than the channel it fills`,
    );
  }
});

test("each side channel meets the trunk under the trunk's own water", () => {
  // A tributary cap that lands in open air would be a hard edge across the
  // canal. Every junction has to sit inside C1's sheet, which covers it.
  const trunk = DUTCH_POLDER_CHANNELS.find((channel) => channel.id === "C1-main");
  const trunkSpine = softenPolyline(trunk.points);
  const trunkReach = waterSheetHalfWidth(trunk.width);
  for (const channel of DUTCH_POLDER_CHANNELS) {
    if (channel.id === trunk.id) continue;
    const [x, z] = channel.points[0];
    assert.ok(
      distanceToPolyline(x, z, trunkSpine) < trunkReach,
      `${channel.id} starts outside the trunk sheet`,
    );
  }
});

test("the water datum clears every carved bed in the polder", () => {
  for (const channel of dutchPolderLandscapeDocument.dryChannels) {
    assert.ok(
      channel.bedElevation < WATER_LEVEL,
      `${channel.id} bed is at or above the water datum`,
    );
  }
});

// ---------------------------------------------------------------------------
// Бюджет служебных проходов. Зеркало и рефракция — два полных рендера сцены
// на кадр сверх основного (§10.8 environmental-rendering-lessons.md); их цена
// зафиксирована здесь, чтобы не отрасти молча, как это сделал кадр августа
// 2026 (78-96 мс GPU на Iris Xe).

test("бюджет воды: служебные проходы не дорожают молча", async () => {
  const budget = await import(
    "../games/make-a-mess/src/game/dutchPolderWaterBudget.ts"
  );

  // Рубильник закоммичен только включённым: false — локальный A/B, не режим.
  assert.equal(budget.WATER_PASS_QUALITY_ENABLED, true);

  // Зеркало читается сквозь трёхтаповый смаз ряби; 512 — решение о цене.
  assert.ok(
    budget.MIRROR_SIZE <= 512,
    `MIRROR_SIZE ${budget.MIRROR_SIZE} вырос без пересмотра бюджета`,
  );

  // Оси спускаются от авторского максимума и не превышают его.
  assert.equal(budget.REFRACTION_SCALES.length, 3);
  assert.equal(budget.MIRROR_FRAME_STRIDES.length, 3);
  const maxScale = budget.REFRACTION_SCALES[2];
  assert.ok(maxScale <= 0.5, `refraction max ${maxScale} дороже половины буфера`);
  for (let quality = 0; quality < 2; quality += 1) {
    assert.ok(
      budget.REFRACTION_SCALES[quality] <= budget.REFRACTION_SCALES[quality + 1],
      "ось рефракции обязана спускаться, а не подниматься",
    );
    assert.ok(
      budget.MIRROR_FRAME_STRIDES[quality] >=
        budget.MIRROR_FRAME_STRIDES[quality + 1],
      "страйд зеркала растёт только вниз по качеству",
    );
  }
  // Авторский максимум не страйдится: качество 2 живёт покадрово.
  assert.equal(budget.MIRROR_FRAME_STRIDES[2], 1);
  // Урез зернеет ниже 0.3 — пол оси, проверенный кадрами.
  assert.ok(
    budget.REFRACTION_SCALES[0] >= 0.3,
    "пол рефракции ниже проверенного кадрами предела",
  );

  // Селектор уважает рубильник и качество.
  assert.equal(budget.waterPassBudget(0).mirrorFrameStride >= 1, true);
  assert.equal(
    budget.waterPassBudget(2).refractionScale,
    budget.REFRACTION_SCALES[2],
  );
});
