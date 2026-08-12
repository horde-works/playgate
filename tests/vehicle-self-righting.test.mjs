import assert from "node:assert/strict";
import test from "node:test";
import {
  VEHICLE_REBUILD_DELAY_SECONDS,
  VEHICLE_RIGHTING_TIMEOUT_SECONDS,
  advanceVehicleRecoveryLifecycle,
  createVehicleRecoveryLifecycle,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";

/**
 * ЛЕЖИТ, НО ЖИВА — ПУСТЬ ВСТАНЕТ САМА.
 *
 * Вердикт Igor (12.08.2026) на упавшего вверх пузом охотника: «прикол в том,
 * что охотник в безвыходное положение попал только в силу нашей логики. Если
 * бы он упал, но технически функционален и может реверсом подняться и
 * вернуться к заданию — он мог бы это сделать».
 *
 * Ошибка была НЕ В ЧИСЛАХ, А В МОМЕНТЕ ВОПРОСА. Исход аварии выбирался один
 * раз — в миг отказа, когда машина кувыркалась и всё выглядело безнадёжно, —
 * и пересмотру не подлежал. Здесь тот же вопрос задаётся заново, когда всё
 * остановилось; ответ часто другой.
 */

function still(overrides = {}) {
  return {
    deltaSeconds: 0.5,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: false,
    arrivalComplete: false,
    ...overrides,
  };
}

/** Прогнать цикл `seconds` секунд одним и тем же наблюдением. */
function run(lifecycle, observation, seconds) {
  let current = lifecycle;
  let recovered = false;
  let rebuilt = false;
  for (let elapsed = 0; elapsed < seconds; elapsed += observation.deltaSeconds) {
    if (!current) {
      break;
    }
    const result = advanceVehicleRecoveryLifecycle(current, observation);
    current = result.lifecycle;
    recovered = recovered || result.recovered;
    rebuilt = rebuilt || result.requestRebuild;
  }
  return { lifecycle: current, recovered, rebuilt };
}

const DOWNED = createVehicleRecoveryLifecycle("criticalAttitude", "tumble");

test("ЛЕЖАЩАЯ И ЦЕЛАЯ ПРОБУЕТ ВСТАТЬ, А НЕ ЖДЁТ ПОДМЕНЫ", () => {
  const settled = { ...DOWNED, phase: "settled", phaseSeconds: 0 };
  const first = advanceVehicleRecoveryLifecycle(
    settled,
    still({ flightworthy: true }),
  );
  assert.equal(first.lifecycle.phase, "righting");
  assert.equal(first.lifecycle.rightingAttempted, true);
  assert.equal(first.requestRebuild, false, "подмену вызвали, не дав встать");
});

test("встала — возвращается к заданию, а не пересобирается", () => {
  const righting = { ...DOWNED, phase: "righting", phaseSeconds: 1 };
  const up = advanceVehicleRecoveryLifecycle(
    righting,
    still({ uprightAgain: true }),
  );
  assert.equal(up.recovered, true);
  assert.equal(up.lifecycle, null, "авария не кончилась вместе с подъёмом");
  assert.equal(up.requestRebuild, false);
});

test("НЕ ВСТАЛА ЗА СВОЙ СРОК — обычный порядок замены", () => {
  // Самовосстановление не должно превращаться в вечное лежание с
  // работающими двигателями: у попытки есть срок, и он короче ожидания
  // подмены — иначе дешевле было бы сразу вызывать замену.
  assert.ok(VEHICLE_RIGHTING_TIMEOUT_SECONDS < VEHICLE_REBUILD_DELAY_SECONDS);
  const righting = { ...DOWNED, phase: "righting", phaseSeconds: 0 };
  const failed = run(
    righting,
    still({ flightworthy: true }),
    VEHICLE_RIGHTING_TIMEOUT_SECONDS + 1,
  );
  assert.equal(failed.lifecycle.phase, "settled");
  assert.equal(failed.recovered, false);
});

test("ПОПЫТКА ОДНА: неудача не зацикливает машину", () => {
  // Без этой защёлки цикл вечен: `settled` видит живую машину, посылает её
  // вставать, та не встаёт, возвращается в `settled` — и так до конца мира,
  // причём подмена не приходит никогда.
  const settled = { ...DOWNED, phase: "settled", phaseSeconds: 0 };
  const whole = run(
    settled,
    still({ flightworthy: true }),
    VEHICLE_RIGHTING_TIMEOUT_SECONDS + VEHICLE_REBUILD_DELAY_SECONDS + 2,
  );
  assert.equal(whole.rebuilt, true, "подмена так и не пришла");
  assert.equal(whole.lifecycle.phase, "rebuilding");
});

test("разбитая не пробует вставать — ей нечем", () => {
  const settled = { ...DOWNED, phase: "settled", phaseSeconds: 0 };
  const broken = run(settled, still({ flightworthy: false }), 31);
  assert.equal(broken.rebuilt, true);
  assert.equal(
    broken.lifecycle.rightingAttempted,
    undefined,
    "разбитую машину всё-таки погнали вставать",
  );
});

test("срок ожидания подмены отсчитывается ЗАНОВО после неудачной попытки", () => {
  // Тонкость, на которой легко потерять машину: если бы `settled` возвращался
  // с накопленным временем, неудачная попытка съедала бы ожидание, и подмена
  // приходила бы раньше срока — то есть авария, где машина пыталась встать,
  // обслуживалась бы быстрее обычной. Здесь проверено, что счёт с нуля.
  const righting = {
    ...DOWNED,
    phase: "righting",
    phaseSeconds: VEHICLE_RIGHTING_TIMEOUT_SECONDS,
  };
  const dropped = advanceVehicleRecoveryLifecycle(
    righting,
    still({ flightworthy: true }),
  );
  assert.equal(dropped.lifecycle.phase, "settled");
  assert.equal(dropped.lifecycle.phaseSeconds, 0);
});
