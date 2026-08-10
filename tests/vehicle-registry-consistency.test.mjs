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
 * Здесь проверяются СВЯЗИ между реестрами, а не содержимое каждого. Чего тут
 * нет и не будет: проверки размещения машины в мире — для неё нужно
 * компилировать все сцены, и это отдельная работа (см.
 * `docs/vehicle-control-lessons.md` §15.7).
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

test("у каждой машины парка есть кадр", () => {
  const frames = new Set(vehicleFrames.map((frame) => frame.clusterId));
  for (const vehicle of airVehicles) {
    assert.ok(
      frames.has(vehicle.clusterId),
      `${vehicle.id}: паспорт есть, кадра нет — машине нечем быть в мире`,
    );
  }
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
  // Профиль опознаётся по ключу группы, а ключ начинается с кластера машины.
  // Опечатка здесь означает дверь, которая просто не откроется тем способом,
  // каким задумана, — и никакого сообщения об этом.
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
