import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseStrikeCorrection,
  chooseStrikeSpeed,
  evaluateStrikeContinuation,
} from "../games/make-a-mess/src/game/airCombatStrikeCorrection.ts";

const input = (overrides = {}) => ({
  own: {
    centre: [0, 30, 0],
    velocity: [12, 0, 0],
    gunAxis: [0, 0, 1],
  },
  target: {
    id: "prey",
    allegiance: "yaqui",
    centre: [0, 30, 55],
    velocity: [10, 0, 0],
    turnRate: 0,
    radius: 4,
    weakPoints: [],
    landed: false,
    failed: false,
  },
  baselineVelocity: [12, 0, 12],
  previousOffset: null,
  capability: {
    maximumSpeed: 36,
    lateralAcceleration: 14.5,
    yawRate: 0.72,
    liftReserve: 4.7,
    surgeAcceleration: 24.8,
  },
  weapons: {
    cannonRange: 70,
    rocketRange: 85,
    rocketSpeed: 96,
    rocketLethalRadius: 2,
    rocketsAvailable: true,
    minimumRange: 12,
  },
  floor: 8,
  ...overrides,
});

test("нулевая поправка — мера: без выигрыша бросок остаётся прежним", () => {
  const result = chooseStrikeCorrection(input());
  assert.equal(result.candidates >= 20, true);
  if (!result.selected) {
    assert.deepEqual(result.velocityOffset, [0, 0, 0]);
    assert.equal(result.gainedFireSeconds, 0);
  } else {
    assert.ok(result.gainedFireSeconds >= 0.25);
  }
  assert.equal("kind" in result, false, "коррекции дали название манёвра");
});

test("коррекция применяется только за выигрыш относительно этого же броска", () => {
  const result = chooseStrikeCorrection(
    input({
      baselineVelocity: [20, 0, 0],
      target: { ...input().target, velocity: [-12, 0, 0], turnRate: 0.35 },
    }),
  );
  assert.ok(
    !result.selected || result.gainedFireSeconds >= 0.25,
    "траектория переписана без прироста огневого решения",
  );
});

test("скорость — часть поля: близкое окно покупается торможением, а не потолком", () => {
  const result = chooseStrikeCorrection(
    input({
      own: {
        centre: [0, 30, 0],
        velocity: [20, 0, 0],
        gunAxis: [0, 0, 1],
      },
      target: { ...input().target, centre: [0, 30, 25], velocity: [0, 0, 0] },
      baselineVelocity: [20, 0, 20],
    }),
  );
  assert.equal(result.selected, true);
  assert.ok(Math.hypot(...result.desiredVelocity) < 20);
  assert.ok(result.gainedFireSeconds >= 0.25);
});

test("скорость умеет расти, если быстрый бросок первым покупает окно", () => {
  const angle = 0.3;
  const result = chooseStrikeSpeed(
    input({
      own: {
        centre: [0, 30, 0],
        velocity: [Math.sin(angle) * 4, 0, Math.cos(angle) * 4],
        gunAxis: [0, 0, 1],
      },
      target: {
        ...input().target,
        centre: [0, 30, 50],
        velocity: [-20, 0, 30],
      },
      baselineVelocity: [Math.sin(angle) * 4, 0, Math.cos(angle) * 4],
    }),
  );
  assert.equal(result.selected, true);
  assert.ok(Math.hypot(...result.desiredVelocity) > 6);
  assert.ok(result.gainedFireSeconds >= 0.25);
});

test("землю и собственный взрыв нельзя купить удержанием окна", () => {
  const downward = evaluateStrikeContinuation(
    input({ floor: 29 }),
    [0, -36, 0],
  );
  assert.equal(downward.feasible, false);
  assert.equal(downward.rejectedBy, "floor");

  const tooClose = evaluateStrikeContinuation(
    input({
      own: { centre: [0, 30, 44], velocity: [0, 0, 8], gunAxis: [0, 0, 1] },
      baselineVelocity: [0, 0, 36],
    }),
    [0, 0, 0],
  );
  assert.equal(tooClose.feasible, false);
  assert.equal(tooClose.rejectedBy, "minimum-range");
});

test("прошлая поправка сохраняется при равном ответе, но не становится обязательством", () => {
  const first = chooseStrikeCorrection(input());
  const continued = chooseStrikeCorrection(
    input({ previousOffset: first.velocityOffset }),
  );
  assert.ok(continued.feasible);
  assert.ok(
    continued.fireSeconds >= continued.baselineFireSeconds,
    "связность куплена ухудшением броска",
  );
});
