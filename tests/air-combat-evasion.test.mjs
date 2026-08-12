import assert from "node:assert/strict";
import test from "node:test";
import {
  breakDirection,
  createEvasionState,
  rocketApproach,
  stepEvasion,
} from "../games/make-a-mess/src/game/airCombatEvasion.ts";

/**
 * УКЛОНЕНИЕ ЖЕРТВЫ — ОТ ПУСКА, А НЕ ОТ ПОДОЗРИТЕЛЬНОГО ПОВЕДЕНИЯ.
 *
 * Первая редакция пугалась геометрии сближения, и вердикт Igor снял её: от
 * ПУШКИ увернуться нельзя вовсе (луч мгновенный), а дёргаться до выстрела —
 * ясновидение и суета. Уклоняются от того, что летит и имеет время полёта.
 *
 * Второй закон здесь так же важен, как первый: НЕ ПОПАДАЕТ — НЕ ДЁРГАЙСЯ.
 */

const CAPABILITY = {
  breakSpeed: 16,
  breakSeconds: 0.8,
  radius: 2.6,
  margin: 2.5,
  horizonSeconds: 2.5,
};
const DECK = 0;

function prey(centre = [0, 30, 0], velocity = [0, 0, 12]) {
  return { allegiance: "yaqui", centre, velocity };
}

/** Ракета, идущая из точки в сторону цели со скоростью 96 м/с. */
function rocket(from, towards, overrides = {}) {
  const dx = towards[0] - from[0];
  const dy = towards[1] - from[1];
  const dz = towards[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    id: 1,
    position: from,
    velocity: [(dx / len) * 96, (dy / len) * 96, (dz / len) * 96],
    blastRadius: 2,
    ...overrides,
  };
}

test("сближение с ракетой считается по обоим движениям, а не по одному", () => {
  // Ракета в лоб с 96 м/с при дистанции 48 м: подлёт около полусекунды, и
  // жертва своим ходом его укорачивает.
  const shot = rocket([0, 30, 48], [0, 30, 0]);
  const { seconds, miss } = rocketApproach(prey(), shot);
  assert.ok(seconds > 0.4 && seconds < 0.5, `подлёт ${seconds.toFixed(3)} с`);
  assert.ok(miss < 0.001, `промах ${miss.toFixed(3)} м при попадании в центр`);
});

test("ушедшая ракета не тревожит: ближайшая точка позади", () => {
  // Прошла мимо и удаляется. Дёргаться поздно и незачем.
  const past = { id: 2, position: [0, 30, -20], velocity: [0, 0, -96], blastRadius: 2 };
  assert.ok(rocketApproach(prey(), past).seconds <= 0);
  const step = stepEvasion({
    own: prey(),
    rockets: [past],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(step.velocityOffset, [0, 0, 0]);
});

test("НЕ ПОПАДАЕТ — НЕ ДЁРГАЙСЯ", () => {
  // Правило израильской ПВО. Ракета пройдёт в стороне дальше, чем радиус
  // поражения с запасом, — манёвр только испортил бы собственный маршрут.
  const wide = rocket([40, 30, 48], [40, 30, 0]);
  const step = stepEvasion({
    own: prey(),
    rockets: [wide],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(
    step.velocityOffset,
    [0, 0, 0],
    "жертва дёрнулась от ракеты, которая и так проходит мимо",
  );
  assert.equal(step.threatId, null);
});

test("идущая в поражение ракета поднимает рывок", () => {
  const step = stepEvasion({
    own: prey(),
    rockets: [rocket([0, 30, 48], [0, 30, 0])],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.ok(step.state.breakSeconds > 0, "рывок обязан начаться");
  assert.equal(step.threatId, 1);
  assert.ok(
    Math.hypot(...step.velocityOffset) > 15,
    `рывок вялый: ${Math.hypot(...step.velocityOffset).toFixed(1)} м/с`,
  );
});

test("далёкая ракета ждёт своего кадра, а не тратит манёвр сейчас", () => {
  // За горизонтом решение спокойно примет следующий кадр.
  const far = { id: 3, position: [0, 30, 400], velocity: [0, 0, -96], blastRadius: 2 };
  const step = stepEvasion({
    own: prey(),
    rockets: [far],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(step.velocityOffset, [0, 0, 0]);
});

test("рывок ДОВОДИТСЯ и не пересматривается внутри срока", () => {
  const first = stepEvasion({
    own: prey(),
    rockets: [rocket([0, 30, 48], [0, 30, 0])],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const chosen = first.state.breakDirection;
  let state = first.state;
  for (let frame = 0; frame < 10; frame += 1) {
    const step = stepEvasion({
      own: prey(),
      rockets: [rocket([2, 31, 40], [0, 30, 0], { id: 9 })],
      capability: CAPABILITY,
      deltaSeconds: 1 / 60,
      state,
      deck: DECK,
    });
    state = step.state;
    assert.deepEqual(step.state.breakDirection, chosen);
  }
});

test("рывок уходит ВДОЛЬ ВЕКТОРА ПРОМАХА, а не наугад вбок", () => {
  // Ракета пройдёт чуть левее центра — уходить надо туда же, только дальше:
  // это прямая производная промаха по смещению.
  const shot = rocket([1.2, 30, 48], [0, 30, 0]);
  const { offset } = rocketApproach(prey(), shot);
  const direction = breakDirection(prey(), offset, DECK);
  const wanted = Math.hypot(offset[0], offset[1], offset[2]) || 1;
  const alignment =
    (direction[0] * offset[0] + direction[1] * offset[1] + direction[2] * offset[2]) /
    wanted;
  assert.ok(alignment > 0.7, `рывок ушёл не туда: совпадение ${alignment.toFixed(2)}`);
});

test("РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ", () => {
  // Тормозящая жертва удобнее для упреждения, а не труднее, и вдобавок
  // бросает свою задачу. Замер первой редакции: средняя скорость падала с
  // 12-14 до 4.2 м/с — она выживала бегством, а не манёвром.
  for (const velocity of [[0, 0, 12], [12, 0, 0], [8, 0, -8]]) {
    const own = { allegiance: "yaqui", centre: [0, 30, 0], velocity };
    const direction = breakDirection(own, [1, 0.2, 0], DECK);
    const speed = Math.hypot(...velocity);
    const along =
      (direction[0] * velocity[0] +
        direction[1] * velocity[1] +
        direction[2] * velocity[2]) /
      speed;
    assert.ok(Math.abs(along) < 1e-6, `продольная составляющая ${along.toFixed(3)}`);
  }
});

test("у самой палубы рывок не уводит вниз", () => {
  // Уклоняться к земле — ровно то, что охотника устраивает.
  const low = breakDirection(
    { allegiance: "yaqui", centre: [0, 3, 0], velocity: [0, 0, 12] },
    [0, -1, 0],
    0,
  );
  assert.ok(low[1] >= 0, `у палубы рывок пошёл вниз: ${low[1].toFixed(2)}`);
});

test("за кромку мира рывок не уводит", () => {
  const boundary = { centre: [0, 0, 0], radius: 55 };
  const direction = breakDirection(
    { allegiance: "yaqui", centre: [50, 30, 0], velocity: [0, 0, 12] },
    [1, 0, 0],
    0,
    boundary,
  );
  assert.ok(
    Math.abs(50 + direction[0] * 20) < boundary.radius,
    `рывок увёл за кромку: x=${(50 + direction[0] * 20).toFixed(1)}`,
  );
});
