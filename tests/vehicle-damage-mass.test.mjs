import assert from "node:assert/strict";
import test from "node:test";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

const density = (material) => structuralMaterialProfiles[material].density;

/**
 * ПОВРЕЖДЕНИЕ НЕ ДЕЛАЕТ МАШИНУ ТЯЖЕЛЕЕ.
 *
 * Обрубок carve заменяет собой часть куска, и считать его по габаритной
 * коробке нельзя: коробка воксельного огрызка больше самого огрызка, и
 * пробитый борт начинал весить больше целого. Дирижабль на этом набирал
 * 347.6 -> 420.9 единиц и снимался с рейса «исчерпанным запасом подъёма»
 * при совершенно целой оболочке.
 */
const wholePiece = {
  id: "car:wall",
  clusterId: "ship",
  material: "steel",
  position: [0, 0, 0],
  size: [2, 1, 0.2],
  volume: 0.4,
  color: "#fff",
};

/** Огрызки: суммарный объём меньше исходного, габариты — почти прежние. */
const stumps = [
  { id: "r1", size: [2, 1, 0.2], boxes: [{ center: [0, 0, 0], size: [0.8, 1, 0.2] }] },
  { id: "r2", size: [2, 1, 0.2], boxes: [{ center: [0, 0, 0], size: [0.6, 1, 0.2] }] },
];

const stumpVolume = (stump) =>
  stump.boxes.reduce((sum, box) => sum + box.size[0] * box.size[1] * box.size[2], 0);

test("обрубки весят свой настоящий объём, а не габарит", () => {
  const intact = massProperties([wholePiece], density);
  const damaged = massProperties(
    stumps.map((stump) => ({
      ...wholePiece,
      id: stump.id,
      size: stump.size,
      volume: stumpVolume(stump),
    })),
    density,
  );
  assert.ok(
    damaged.mass < intact.mass,
    `пробитый кусок должен стать легче: было ${intact.mass}, стало ${damaged.mass}`,
  );

  // А по габаритной коробке он оказался бы ТЯЖЕЛЕЕ целого — это и был баг.
  const byBounds = massProperties(
    stumps.map((stump) => ({ ...wholePiece, id: stump.id, size: stump.size, volume: undefined })),
    density,
  );
  assert.ok(
    byBounds.mass > intact.mass,
    "контрольная проверка: габаритный счёт действительно завышает массу",
  );
});
