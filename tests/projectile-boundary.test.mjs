import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_NORMAL,
  ACTOR_SAFETY_FLOOR,
  DEBRIS_NORMAL,
  PROJECTILE_FLIGHT,
  VEHICLE_ATTACHMENT,
  VEHICLE_CARRIER,
  WORLD_BOUNDARY,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";

/**
 * НЕБО — НЕ БАРЬЕР ДЛЯ СНАРЯДА.
 *
 * Симптом, ради которого написан файл (наблюдение Igor, 11.08.2026): ракеты
 * взрывались в воздухе, сильно не долетая до цели, и небо читалось как
 * барьер с обеих сторон. Так и было: снаряд объявляли «как актёра», а в
 * фильтре актёра стоит `GROUP_BOUNDARY` — то есть кольцо-ограничитель мира и
 * пол безопасности. Обе эти вещи невидимы и поставлены ДЛЯ ПЕШЕХОДА: одна
 * держит его на острове, другая ловит при падении.
 *
 * На полигоне кольцо стоит на радиусе 55, а боевая пара уходит на 144 — то
 * есть машины летают СНАРУЖИ ограничителя и стреляют сквозь него.
 *
 * Арифметика Rapier: тела сталкиваются, если ОБА условия верны —
 * `(A.членство & B.фильтр)` и `(B.членство & A.фильтр)`. Достаточно убрать
 * границу из фильтра снаряда, и вторая половина становится нулём.
 */

const memberships = (groups) => groups >>> 16;
const filter = (groups) => groups & 0xffff;

function collide(a, b) {
  return (
    (memberships(a) & filter(b)) !== 0 && (memberships(b) & filter(a)) !== 0
  );
}

test("снаряд НЕ разбивается о мебель, поставленную для пешехода", () => {
  assert.equal(
    collide(PROJECTILE_FLIGHT, WORLD_BOUNDARY),
    false,
    "кольцо-ограничитель снова стало барьером для снаряда",
  );
  assert.equal(
    collide(PROJECTILE_FLIGHT, ACTOR_SAFETY_FLOOR),
    false,
    "снаряд снова разбивается о невидимый пол игрока",
  );
});

test("пешеход этой мебелью по-прежнему удерживается", () => {
  // Обратная сторона: снимая границу снаряду, легко снять её и человеку.
  assert.equal(collide(ACTOR_NORMAL, WORLD_BOUNDARY), true);
  assert.equal(collide(ACTOR_NORMAL, ACTOR_SAFETY_FLOOR), true);
});

test("снаряд по-прежнему попадает во всё, во что должен", () => {
  // Правка снимает ровно одно и не должна снять остальное. Проверяется через
  // НАСТОЯЩИЕ группы соседей, а не через угаданные биты: первая редакция
  // этого теста выписала номера по памяти и ошиблась на разряд, объявив
  // машину непопадаемой.
  for (const [name, other] of [
    ["носитель", VEHICLE_CARRIER],
    ["подвеска носителя", VEHICLE_ATTACHMENT],
    ["обломок", DEBRIS_NORMAL],
  ]) {
    assert.equal(
      collide(PROJECTILE_FLIGHT, other),
      true,
      `снаряд перестал попадать: ${name}`,
    );
  }
});
