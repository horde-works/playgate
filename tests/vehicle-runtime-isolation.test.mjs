import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";

/**
 * РАНТАЙМ НЕ ЗНАЕТ ИМЁН МАШИН.
 *
 * `VehicleFrameSystem` — общий покадровый контур: он ведёт любую машину, у
 * которой есть паспорт, и не имеет права ветвиться по тому, ЧЬЯ она.
 * Способность объявляется паспортом — `armament` объявляет вооружение,
 * `flight.combatStation` объявляет сторожевой пост, `rotorcraftControls`
 * объявляет место ручного управления, — и движок спрашивает про способность,
 * а не про имя.
 *
 * Сторож нужен потому, что нарушение этого правила не выглядит нарушением.
 * Импортировать константу конкретной карты дешевле, чем завести поле в
 * паспорте, и каждый раз это выглядит как «мелочь на один случай». Так в
 * контур приехали три числа полигона Tonkawa, а имя кресла городского коптера
 * стоило Нимбу ручного управления целиком.
 *
 * СПИСОК ИМЁН ВЫВОДИТСЯ ИЗ КАТАЛОГА, А НЕ ПИШЕТСЯ РУКАМИ. Первая редакция
 * держала словарь из пяти корней, и он устарел быстрее каталога: `VX-8`,
 * `SR-6` и всё, что появится дальше, были ему невидимы. Каталог знает про
 * машины всё и по определению не отстаёт.
 */

const RUNTIME = fileURLToPath(
  new URL(
    "../games/make-a-mess/src/game/VehicleFrameSystem.tsx",
    import.meta.url,
  ),
);

const source = readFileSync(RUNTIME, "utf8");

/**
 * `combat-hexacopter` → кебаб, `combatHexacopter`, `CombatHexacopter`,
 * `COMBAT_HEXACOPTER`.
 *
 * Заглавная форма нужна не для красоты: имя, вставленное в середину другого
 * идентификатора (`dataset.mamSkyTrain`), выживает только в ней, и без неё
 * отладочные признаки уезжают из-под сторожа молча.
 */
function spellingsOf(id) {
  const parts = id.split(/[-:]/).filter(Boolean);
  const upperFirst = (part) => part[0].toUpperCase() + part.slice(1);
  const camel = parts
    .map((part, index) => (index === 0 ? part : upperFirst(part)))
    .join("");
  return [id, camel, upperFirst(camel), parts.join("_").toUpperCase()];
}

/**
 * Долг, который в контуре ещё стоит, — ПОИМЁННО и с причиной.
 *
 * Всё оставшееся — одна машина, расписной состав, и все три вхождения родом из
 * одного блока: обслуживание рейса по расписанию (526 строк, первый кандидат
 * на вынос по плану `docs/vehicle-control-lessons.md` §15.4). Место машиниста
 * выбирается веткой ПО СЦЕНЕ, а не по машине, и приёмом «способность у
 * объекта» не лечится: общий признак «кресло управления» свёл бы в один контур
 * машиниста состава, водителя ситроена и пилота коптера, которых ведут разные
 * системы.
 */
const KNOWN_DEBT = new Set(["sky-train", "SKY_TRAIN", "SkyTrain"]);

test("боевой контур не ветвится по имени машины и не знает разметки карты", () => {
  assert.ok(
    !source.includes("COMBAT_HEXACOPTER"),
    "в контур вернулась именная константа боевого коптера",
  );
  assert.ok(
    !source.includes("combatHexacopterRangeRoutes"),
    "в контур вернулся импорт маршрутов конкретной машины на конкретной карте",
  );
  assert.ok(
    source.includes("frame.flight.combatStation"),
    "бой обязан спрашивать паспорт о посте, а не имя задачи",
  );
});

test("контур не знает и ИМЕНИ БОЕВОЙ ЗАДАЧИ", () => {
  // Имя задачи — такой же окольный путь к машине, как имя кресла или поста:
  // `kind === "sky-control"` есть ветвление по одной машине одной карты, даже
  // если слова «гексакоптер» в строке нет. Литерал проверяется в кавычках,
  // поэтому его нельзя вернуть и оправдаться комментарием.
  const kinds = new Set();
  for (const vehicle of airVehicles) {
    for (const action of vehicle.departure?.target?.actions ?? []) {
      kinds.add(action.id);
    }
  }
  // Родовые имена рейсов законны и в контуре не проверяются: ветвление по ним
  // не привязывает движок ни к одной машине.
  const GENERIC = new Set(["circuit", "manual", "tour", "evasive", "ride"]);
  for (const kind of kinds) {
    if (GENERIC.has(kind)) {
      continue;
    }
    assert.ok(
      !source.includes(`"${kind}"`),
      `контур сравнивает рейс с именем задачи "${kind}"`,
    );
  }
});

test("ручное управление даёт СВОЙСТВО кресла, а не его имя", () => {
  assert.ok(
    source.includes("seatCommandsRotorcraft"),
    "контур обязан спрашивать у кресла способность, а не сравнивать имя",
  );
  assert.ok(
    !source.includes("TOWN_HEXACOPTER_PILOT_SEAT"),
    "в контур вернулось имя конкретного кресла конкретной машины",
  );
});

test("ИЗВЕСТНЫЙ ДОЛГ: в контуре осталась ровно одна машина, поимённо", () => {
  const found = new Set();
  for (const vehicle of airVehicles) {
    for (const spelling of [
      ...spellingsOf(vehicle.id),
      ...spellingsOf(vehicle.clusterId),
    ]) {
      // Односложные имена («vehicle», «airship») встречаются в общем коде как
      // обычные слова и машину не выдают: ветвление по ним невозможно.
      if (spelling.length < 6 || !spelling.match(/[-_A-Z]/)) {
        continue;
      }
      if (source.includes(spelling)) {
        found.add(spelling);
      }
    }
  }
  assert.deepEqual([...found].sort(), [...KNOWN_DEBT].sort());
});
