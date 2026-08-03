import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_ABOARD,
  ACTOR_NORMAL,
  VEHICLE_ATTACHMENT,
  VEHICLE_CARRIER,
  WORLD_BOUNDARY,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";
import {
  PASSENGER_STANCE_ACCELERATION,
  passengerControlVelocityDelta,
  supportVelocityAtPoint,
} from "../games/make-a-mess/src/game/movingSupportDynamics.ts";

// ---------------------------------------------------------------------------
// ПАССАЖИР НА ПАЛУБЕ ХОДЯЩЕГО НОСИТЕЛЯ
//
// Проверяется то, что однажды уже сломалось молча: человек, идущий по палубе
// летящего корабля, проваливался сквозь неё вниз. Причина была не в физике
// опоры — она считалась правильно, — а в МАСКЕ СТОЛКНОВЕНИЙ: как только
// носитель признавали подвижной опорой, капсула переключалась в «на борту» и
// переставала сталкиваться с самим носителем.
//
// Симптом при этом выглядел как потеря инерциальной системы отсчёта, хотя
// система отсчёта была ни при чём.
// ---------------------------------------------------------------------------

const membership = (groups) => (groups >>> 16) & 0xffff;
const filter = (groups) => groups & 0xffff;

const collides = (a, b) =>
  (filter(a) & membership(b)) !== 0 && (filter(b) & membership(a)) !== 0;

test("пассажир на борту НЕ проваливается сквозь носитель", () => {
  assert.ok(
    collides(ACTOR_ABOARD, VEHICLE_CARRIER),
    "капсула «на борту» не сталкивается с носителем — палуба исчезает из-под ног",
  );
  assert.ok(
    collides(ACTOR_ABOARD, VEHICLE_ATTACHMENT),
    "капсула «на борту» проходит сквозь навесные механизмы носителя",
  );
});

test("маска «на борту» снимает ГРАНИЦУ МИРА и только её", () => {
  // Ровно в этом смысл режима: улетающий обязан пересечь кольцо-ограничитель,
  // которое держит пешехода на острове. Всё прочее обязано совпадать с
  // обычным режимом, иначе на борту отваливается что-нибудь ещё.
  assert.ok(collides(ACTOR_NORMAL, WORLD_BOUNDARY));
  assert.ok(!collides(ACTOR_ABOARD, WORLD_BOUNDARY));
  const dropped = filter(ACTOR_NORMAL) & ~filter(ACTOR_ABOARD);
  const added = filter(ACTOR_ABOARD) & ~filter(ACTOR_NORMAL);
  assert.equal(
    added,
    0,
    "режим «на борту» добавил столкновения, которых нет в обычном",
  );
  assert.equal(
    dropped & ~membership(WORLD_BOUNDARY),
    0,
    "режим «на борту» снял не только границу мира",
  );
});

test("опора отдаёт свою скорость в точке контакта, а не в центре", () => {
  // Вращающийся носитель везёт человека тем быстрее, чем дальше он от оси:
  // без этого пассажира сдувает с края палубы на первом же развороте.
  const support = {
    linearVelocity: { x: 4, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 1, z: 0 },
    centreOfMass: { x: 0, y: 0, z: 0 },
  };
  const centre = supportVelocityAtPoint(support, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(centre.x - 4) < 1e-9 && Math.abs(centre.z) < 1e-9);
  const rim = supportVelocityAtPoint(support, { x: 0, y: 0, z: 3 });
  assert.ok(
    Math.abs(rim.x - 7) < 1e-9,
    `на ободе скорость ${rim.x}, а должна быть 4 + 1×3`,
  );
});

test("стоящий пассажир подтягивается к скорости палубы, но не мгновенно", () => {
  // Тяга конечна намеренно: резкий рывок носителя обязан уводить палубу
  // из-под ног, иначе человек приклеен к кораблю и никакой инерции нет.
  const delta = 1 / 60;
  const step = passengerControlVelocityDelta({
    velocity: { x: 0, y: 0, z: 0 },
    supportVelocity: { x: 10, y: 0, z: 0 },
    desiredRelativeVelocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    delta,
  });
  assert.ok(step.x > 0, "стоящий пассажир вообще не подхватывается палубой");
  assert.ok(
    step.x < 10,
    "пассажир мгновенно принял скорость палубы — инерции не осталось",
  );
  assert.ok(step.x >= PASSENGER_STANCE_ACCELERATION * delta - 1e-9);
});

test("без опоры пассажир сохраняет импульс и не управляется", () => {
  const step = passengerControlVelocityDelta({
    velocity: { x: 0, y: 0, z: 0 },
    supportVelocity: { x: 10, y: 0, z: 0 },
    desiredRelativeVelocity: { x: 5, y: 0, z: 0 },
    grounded: false,
    delta: 1 / 60,
  });
  assert.deepEqual(step, { x: 0, y: 0, z: 0 });
});
