import assert from "node:assert/strict";
import test from "node:test";
import { solveSteelPenetration } from "../games/make-a-mess/src/game/ballisticPenetration.ts";

const capability = { steelThicknessAtNormal: 0.012 };

test("предел паспорта означает физическую толщину стали по нормали", () => {
  const atLimit = solveSteelPenetration(capability, {
    plateThickness: 0.012,
    direction: [0, 0, 5],
    normal: [0, 0, -2],
  });
  const beyond = solveSteelPenetration(capability, {
    plateThickness: 0.0121,
    direction: [0, 0, 1],
    normal: [0, 0, 1],
  });

  assert.equal(atLimit.penetrates, true);
  assert.equal(atLimit.incidenceCosine, 1);
  assert.ok(Math.abs(atLimit.effectiveThickness - 0.012) < 1e-12);
  assert.equal(beyond.penetrates, false);
});

test("косой ракурс увеличивает приведённую толщину, а не назначает штраф", () => {
  const result = solveSteelPenetration(capability, {
    plateThickness: 0.01,
    direction: [0.6, 0, 0.8],
    normal: [0, 0, 1],
  });

  assert.ok(Math.abs(result.incidenceCosine - 0.8) < 1e-12);
  assert.ok(Math.abs(result.effectiveThickness - 0.0125) < 1e-12);
  assert.equal(result.penetrates, false);
});

test("знак нормали и масштаб векторов на результат не влияют", () => {
  const front = solveSteelPenetration(capability, {
    plateThickness: 0.008,
    direction: [0, 0, 3],
    normal: [0, 0, -4],
  });
  const back = solveSteelPenetration(capability, {
    plateThickness: 0.008,
    direction: [0, 0, 1],
    normal: [0, 0, 1],
  });

  assert.deepEqual(front, back);
  assert.equal(front.penetrates, true);
  assert.ok(Math.abs(front.residualThickness - 0.004) < 1e-12);
});

test("скользящий удар и пулемёт с нулевым пределом сталь не берут", () => {
  const grazing = solveSteelPenetration(capability, {
    plateThickness: 0.001,
    direction: [1, 0, 0],
    normal: [0, 0, 1],
  });
  const machineGun = solveSteelPenetration(
    { steelThicknessAtNormal: 0 },
    {
      plateThickness: 0.001,
      direction: [0, 0, 1],
      normal: [0, 0, 1],
    },
  );

  assert.equal(grazing.penetrates, false);
  assert.equal(grazing.effectiveThickness, Number.POSITIVE_INFINITY);
  assert.equal(machineGun.penetrates, false);
});

