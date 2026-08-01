import assert from "node:assert/strict";
import test from "node:test";
import {
  blastVictims,
  clusterTargets,
} from "../tools/blast-lab.mjs";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";

/**
 * ГРУЗИЛО ДИФФЕРЕНТОВКИ ЖИВЁТ В КИЛЕ, ПОД ОБОЛОЧКОЙ.
 *
 * Раздолбать его, не вскрыв корпус, нельзя: это стальной балласт внутри
 * судна, а не навесная железка. Лёгкая ракета не достаёт до него ни с
 * одного ракурса; тяжёлая достаёт только вместе с обшивкой, и это честно —
 * корпус к тому моменту пробит.
 */
const CLUSTER = "terminal:sky-train";
const pieces = grandTerminalScene.breakablePieces;
const targets = clusterTargets(CLUSTER, pieces);
const trimIds = pieces
  .filter((piece) => piece.clusterId === CLUSTER && piece.id.includes("trim:"))
  .map((piece) => piece.id);

const shots = [
  ["кормовой торец", [21.4, 7.2, 77.6]],
  ["под килем", [5.6, 6.0, 77.6]],
  ["борт у киля", [5.6, 7.0, 74.0]],
  ["над оболочкой", [5.6, 13.0, 77.6]],
];

test("лёгкая ракета не выбивает дифферентовку сквозь целый корпус", () => {
  assert.ok(trimIds.length > 0, "у поезда должна быть дифферентовка");
  for (const [label, at] of shots) {
    const victims = blastVictims("lance", at, targets);
    const lost = trimIds.filter((id) => victims.has(id));
    assert.equal(
      lost.length,
      0,
      `${label}: игла не должна доставать до балласта, а выбила ${lost.join(", ")}`,
    );
  }
});

test("тяжёлая ракета добирается до балласта только вскрыв обшивку", () => {
  const victims = blastVictims("rocket", [5.6, 7.0, 74.0], targets);
  const lost = trimIds.filter((id) => victims.has(id));
  const skin = [...victims].filter((id) => id.includes(":skin:")).length;
  if (lost.length > 0) {
    assert.ok(
      skin > 20,
      `балласт задет при целой обшивке (снесено всего ${skin} полотнищ) — так быть не должно`,
    );
  }
});
