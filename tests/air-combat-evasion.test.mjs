import assert from "node:assert/strict";
import test from "node:test";
import {
  breakDirection,
  closingSeconds,
  createEvasionState,
  onCollisionCourse,
  stepEvasion,
} from "../games/make-a-mess/src/game/airCombatEvasion.ts";

/**
 * УКЛОНЕНИЕ ЖЕРТВЫ.
 *
 * Проверяется не «дёргается ли машина», а три решения, на которых стоит весь
 * модуль: угроза опознаётся ПО ТРАЕКТОРИИ (ствола жертве не видно и не будет),
 * рывок ДОВОДИТСЯ до конца (иначе два реактивных контура сцепляются в танец,
 * который охотник упреждает идеально), и направление выбирается ВНУТРИ
 * КОНВЕРТА (иначе машина красиво уворачивается в землю).
 */

const CAPABILITY = { breakSpeed: 9, breakSeconds: 1.2, warningSeconds: 4 };
const DECK = 0;

function prey(centre = [0, 30, 0], velocity = [0, 0, 12]) {
  return { allegiance: "yaqui", centre, velocity };
}

function hunter(centre, velocity, overrides = {}) {
  return {
    id: "rax",
    allegiance: "tonkawa",
    centre,
    velocity,
    turnRate: 0,
    radius: 3.4,
    weakPoints: [],
    landed: false,
    failed: false,
    ...overrides,
  };
}

test("сближение считается по линии визирования, а не по модулю скорости", () => {
  // Борт прямо по курсу, идущий навстречу: встреча близка.
  const head = closingSeconds(prey(), hunter([0, 30, 60], [0, 0, -18]));
  assert.ok(head !== null && Math.abs(head - 2) < 0.01, `получено ${head}`);

  // Тот же борт, та же скорость — но поперёк. Сближение ЕСТЬ: жертва сама
  // летит на него со своими двенадцатью. Отсеивает такого не эта ступень, а
  // следующая — правило пеленга; здесь проверяется именно разделение труда.
  const across = closingSeconds(prey(), hunter([0, 30, 60], [30, 0, 0]));
  assert.ok(across !== null && Math.abs(across - 5) < 0.01, `получено ${across}`);
  assert.equal(
    onCollisionCourse(prey(), hunter([0, 30, 60], [30, 0, 0]), across),
    false,
    "поперечный борт обязан отсеиваться пеленгом, а не сближением",
  );

  // Убегающий — тем более.
  assert.equal(closingSeconds(prey(), hunter([0, 30, 60], [0, 0, 40])), null);
});

test("ПЕЛЕНГ НЕ МЕНЯЕТСЯ, ДИСТАНЦИЯ ПАДАЕТ — значит идёт на тебя", () => {
  // Классическое правило встречи. Борт точно по линии — курс столкновения.
  assert.equal(
    onCollisionCourse(prey(), hunter([0, 30, 60], [0, 0, -18]), 2),
    true,
  );
  // Тот же борт, но с большим боковым сносом: к встрече он не придёт.
  assert.equal(
    onCollisionCourse(prey(), hunter([0, 30, 60], [40, 0, -18]), 2),
    false,
    "борт с большим вращением пеленга не должен пугать",
  );
});

test("рывок ДОВОДИТСЯ и не пересматривается внутри срока", () => {
  // Главная ловушка места: жертва, решающая заново каждый кадр, дрожит и
  // никуда не уходит, а её манёвр становится функцией от действий охотника.
  const first = stepEvasion({
    own: prey(),
    tracks: [hunter([0, 30, 40], [0, 0, -20])],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.ok(first.state.breakSeconds > 0, "рывок обязан начаться");
  const chosen = first.state.breakDirection;

  // Охотник сменил сторону — направление рывка меняться НЕ должно.
  let state = first.state;
  for (let frame = 0; frame < 20; frame += 1) {
    const step = stepEvasion({
      own: prey(),
      tracks: [hunter([0, 30, 40], [0, 0, -20], { id: "rax" })],
      capability: CAPABILITY,
      deltaSeconds: 1 / 60,
      state,
      deck: DECK,
    });
    state = step.state;
    assert.deepEqual(
      step.state.breakDirection,
      chosen,
      "направление рывка пересмотрено внутри срока",
    );
  }
});

test("рывок кончается сам и машина возвращается к трассе", () => {
  let state = { breakSeconds: 0.1, breakDirection: [1, 0, 0], threatId: "rax" };
  const step = stepEvasion({
    own: prey(),
    // Угрозы больше нет: борт ушёл.
    tracks: [hunter([0, 30, 300], [0, 0, 40])],
    capability: CAPABILITY,
    deltaSeconds: 0.2,
    state,
    deck: DECK,
  });
  assert.equal(step.state.breakSeconds, 0);
  assert.deepEqual(step.velocityOffset, [0, 0, 0], "поправка обязана погаснуть");
});

test("севший и отказавший борт не пугают, свой — тем более", () => {
  const base = {
    own: prey(),
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  };
  for (const track of [
    hunter([0, 30, 40], [0, 0, -20], { landed: true }),
    hunter([0, 30, 40], [0, 0, -20], { failed: true }),
    hunter([0, 30, 40], [0, 0, -20], { allegiance: "yaqui" }),
    hunter([0, 30, 40], [0, 0, -20], { allegiance: "civil" }),
  ]) {
    const step = stepEvasion({ ...base, tracks: [track] });
    assert.deepEqual(
      step.velocityOffset,
      [0, 0, 0],
      `испугались того, кого не должны: ${JSON.stringify(track.allegiance)}`,
    );
  }
});

test("у самой палубы рывок уходит ВВЕРХ, а не вниз", () => {
  // Уклоняться вниз к земле — ровно то, что охотника устраивает.
  const low = breakDirection(
    { allegiance: "yaqui", centre: [0, 3, 0], velocity: [0, 0, 12] },
    hunter([0, 3, 40], [0, 0, -20]),
    0,
  );
  assert.ok(low[1] > 0.4, `у палубы рывок пошёл вниз или вбок: ${low[1]}`);
  assert.ok(low[1] < 1, "рывок обязан остаться и боковым");
});

test("КОНВЕРТ ФИЛЬТРУЕТ НАПРАВЛЕНИЯ ДО выбора: не уходим за кромку мира", () => {
  // Машина у восточной кромки: рывок на восток вывел бы её из мира.
  const boundary = { centre: [0, 0, 0], radius: 55 };
  const direction = breakDirection(
    { allegiance: "yaqui", centre: [50, 30, 0], velocity: [0, 0, 12] },
    hunter([50, 30, 40], [0, 0, -20]),
    0,
    boundary,
  );
  const ahead = 50 + direction[0] * 20;
  assert.ok(
    Math.abs(ahead) < boundary.radius,
    `рывок увёл за кромку: x=${ahead.toFixed(1)} при радиусе ${boundary.radius}`,
  );
});

test("выдержка рывка ГУЛЯЕТ, а не одинакова каждый раз", () => {
  // Одинаковая выдержка склеивает два контура в устойчивый танец, который
  // охотник упреждает идеально. Разброс берётся из геометрии, поэтому он
  // воспроизводим, но не периодичен.
  const dwell = (range) =>
    stepEvasion({
      own: prey(),
      tracks: [hunter([0, 30, range], [0, 0, -20])],
      capability: CAPABILITY,
      deltaSeconds: 1 / 60,
      state: createEvasionState(),
      deck: DECK,
    }).state.breakSeconds;

  const samples = [30, 37, 44, 51, 58].map(dwell);
  assert.ok(
    new Set(samples.map((value) => value.toFixed(3))).size > 1,
    `выдержка одинакова при разной геометрии: ${samples.join(", ")}`,
  );
  for (const value of samples) {
    assert.ok(
      value > 0.5 && value < 2.5,
      `выдержка вышла за разумное: ${value}`,
    );
  }
});

test("РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ", () => {
  // Под огнём не сбрасывают ход: тормозящая жертва удобнее для упреждения, а
  // не труднее, и вдобавок бросает свою задачу. Первая редакция этого не
  // снимала, и средняя скорость жертвы падала с 12–14 до 4.2 м/с — она
  // выживала бегством, а не манёвром.
  for (const [centre, velocity] of [
    [[0, 30, 0], [0, 0, 12]],
    [[0, 30, 0], [12, 0, 0]],
    [[0, 30, 0], [8, 0, -8]],
  ]) {
    const own = { allegiance: "yaqui", centre, velocity };
    const direction = breakDirection(own, hunter([0, 30, 40], [0, 0, -20]), 0);
    const heading = Math.hypot(velocity[0], velocity[1], velocity[2]);
    const along =
      (direction[0] * velocity[0] +
        direction[1] * velocity[1] +
        direction[2] * velocity[2]) /
      heading;
    assert.ok(
      Math.abs(along) < 1e-6,
      `рывок имеет продольную составляющую ${along.toFixed(3)}: машина затормозит`,
    );
  }
});
