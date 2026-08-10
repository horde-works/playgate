import assert from "node:assert/strict";
import test from "node:test";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { vehicleFrames } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { passengerSeats } from "../games/make-a-mess/src/game/passengerSeats.ts";
import {
  PLUG_SLIDE_DOORS,
  TAIL_RAMPS,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import { DS_CLUSTER_ID } from "../games/make-a-mess/src/game/townCitroenDs.ts";

/**
 * У МАШИНЫ НЕ ОДИН РЕЕСТР, А НЕСКОЛЬКО, И ЗАБЫТЬ ОДИН МОЖНО МОЛЧА.
 *
 * Общий контур не знает имён машин — это проверяет
 * `vehicle-runtime-isolation`. Но плата за такую развязку в том, что машина
 * теперь СОБИРАЕТСЯ ИЗ ОБЪЯВЛЕНИЙ, разложенных по нескольким спискам: кадр
 * (`vehicleFrames`), паспорт (`airVehicles`), место (`passengerSeats`),
 * размерный профиль двери (`hingedGatePolicy`). Пропуск в любом из них не
 * ломает ни сборку, ни тайпчек: машина просто молча теряет способность.
 *
 * Так это уже стоило Нимбу ручного управления, и там был не пропуск, а
 * сравнение по имени, — но симптом тот же: объявлено, зарегистрировано,
 * покрыто геометрическим тестом и НЕ РАБОТАЕТ.
 *
 * Здесь проверяются СВЯЗИ между реестрами: висячие ссылки, дубли и порядок, на
 * который опирается рантайм. Чего тут НЕТ, и это надо знать, читая зелёный
 * прогон:
 *
 *  - не ловится ПРОПУСК объявления (машина без места, машина без дверного
 *    профиля): отличить «не объявлено» от «не нужно» по одним реестрам
 *    нельзя — нужен вопрос к самой машине, и один такой вопрос уже задан в
 *    `passenger-seats` от паспорта («обещаешь manual — имей место»);
 *  - не ловится опечатка в ХВОСТЕ дверного ключа и вообще любое расхождение с
 *    настоящими кусками сцены: для этого нужно компилировать все миры, и это
 *    отдельная работа (см. `docs/vehicle-control-lessons.md` §15.7).
 */

const airClusters = new Set(airVehicles.map((vehicle) => vehicle.clusterId));
/** Наземные носители: у них свои системы, но кресла лежат в общем списке. */
const groundClusters = new Set([DS_CLUSTER_ID]);
const allClusters = new Set([...airClusters, ...groundClusters]);

test("каталог парка не двоится: кластеры и имена уникальны", () => {
  assert.equal(
    new Set(airVehicles.map((vehicle) => vehicle.id)).size,
    airVehicles.length,
    "две машины с одним именем",
  );
  assert.equal(
    airClusters.size,
    airVehicles.length,
    "две машины на одном кластере: рантайм подберёт одну и молча потеряет вторую",
  );
});

test("кадр и паспорт ходят парой в ОБЕ стороны", () => {
  // ОБА направления настоящие, и вторая редакция этого теста была неправа,
  // объявив прямое тавтологией.
  //
  // Прямое («у паспорта есть кадр») тавтологично для семи машин из девяти: они
  // собраны через `vehicleFrames.find(...)` с немедленным `throw`, и промах
  // роняет импорт задолго до теста. Но ДВЕ машины полигона спредят кадр,
  // импортированный напрямую из своего модуля, а в реестр `vehicleFrames` он
  // попадает отдельной строкой. Убери эту строку — паспорт цел, импорт цел,
  // тайпчек цел, а поиск кадра по кластеру машину уже не знает: её куски
  // перестают признаваться кадром.
  //
  // Обратное («кадр без паспорта») — машина, которую нечем отправить: она
  // соберётся в мире, встанет на площадку и не примет ни одного приказа,
  // потому что рантайм подбирает машины из каталога паспортов.
  const frames = new Set(vehicleFrames.map((frame) => frame.clusterId));
  for (const vehicle of airVehicles) {
    assert.ok(
      frames.has(vehicle.clusterId),
      `${vehicle.id}: паспорт есть, кадра в реестре нет — куски машины перестанут признаваться её кадром`,
    );
  }

  const passports = new Set(airVehicles.map((vehicle) => vehicle.clusterId));
  const orphans = vehicleFrames
    .map((frame) => frame.clusterId)
    .filter((clusterId) => !passports.has(clusterId));
  assert.deepEqual(
    orphans,
    [],
    "кадр без паспорта: машина соберётся, но приказа не примет",
  );
});

test("на кластер приходится ровно одно место", () => {
  // Инвариант, на котором стоит поиск места по машине
  // (`passengerSeatForCluster`), а через него — и вопрос «даёт ли это место
  // штурвал» в момент ручного запуска. Пока мест по одному, вопрос
  // однозначен; два места на кластере делают ответ зависящим от ПОРЯДКА в
  // списке, а порядок — не то, на чём должна держаться передача управления.
  //
  // Сама функция на этот день подстрахована предпочтением управляющего места,
  // но подстраховка не отменяет сторожа: молчаливое появление второго места
  // должно быть замечено здесь, а не в полёте.
  const byCluster = new Map();
  for (const seat of passengerSeats) {
    byCluster.set(seat.carrierClusterId, [
      ...(byCluster.get(seat.carrierClusterId) ?? []),
      seat.id,
    ]);
  }
  const crowded = [...byCluster.entries()]
    .filter(([, seats]) => seats.length > 1)
    .map(([cluster, seats]) => `${cluster}: ${seats.join(", ")}`);
  assert.deepEqual(crowded, []);
});

test("каждое место принадлежит существующей машине", () => {
  // Переименованный кластер — самый дешёвый способ осиротить кресло: тип
  // сойдётся, тайпчек промолчит, а сесть будет некуда.
  for (const seat of passengerSeats) {
    assert.ok(
      allClusters.has(seat.carrierClusterId),
      `${seat.id}: кресло висит на кластере ${seat.carrierClusterId}, которого нет ни в парке, ни среди наземных`,
    );
  }
});

test("каждый дверной профиль принадлежит существующей машине", () => {
  // ГРАНИЦА ЧЕСТНАЯ: проверяется только ПРЕФИКС — что профиль приписан машине,
  // которая существует. Опечатку в хвосте ключа (`:head:dorr`) это НЕ ловит, и
  // первая редакция комментария обещала обратное. Поймать хвост можно только
  // сверкой с настоящими кусками сцены, то есть компиляцией всех миров, — это
  // отдельная работа (§15.7), и обещать её здесь значит закрыть вопрос
  // зелёным светом.
  for (const door of [...PLUG_SLIDE_DOORS, ...TAIL_RAMPS]) {
    const owner = [...allClusters].find((cluster) =>
      door.doorId.startsWith(`${cluster}:`),
    );
    assert.ok(
      owner,
      `${door.doorId}: профиль двери не принадлежит ни одной известной машине`,
    );
  }
});

test("профили дверей не двоятся по ключу", () => {
  const keys = [...PLUG_SLIDE_DOORS, ...TAIL_RAMPS].map((door) => door.doorId);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "две записи на один ключ: сработает первая, вторая недостижима",
  );
});
